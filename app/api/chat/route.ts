import { NextResponse } from "next/server";
import type { ChatMessage } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64_000;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_TOTAL_LENGTH = 48_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

type RateBucket = { count: number; resetAt: number };

// Best-effort per-instance limiter only. Use a shared store before public,
// multi-instance deployment.
const requestBuckets = new Map<string, RateBucket>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false;
  return (
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    value.content.trim().length > 0 &&
    value.content.length <= MAX_MESSAGE_LENGTH
  );
}

function getClientKey(request: Request): string {
  // This header is only a temporary limiter key, never an identity signal.
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  for (const [bucketKey, bucket] of requestBuckets) {
    if (bucket.resetAt <= now) requestBuckets.delete(bucketKey);
  }

  if (!requestBuckets.has(key) && requestBuckets.size >= 5_000) {
    const oldestKey = requestBuckets.keys().next().value;
    if (oldestKey) requestBuckets.delete(oldestKey);
  }

  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) return true;
  bucket.count += 1;
  return false;
}

async function readLimitedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

function providerErrorMessage(status: number): string {
  if (status === 429) return "The AI provider is busy. Please try again shortly.";
  if (status === 401 || status === 403) return "The AI provider rejected the configured credentials.";
  if (status >= 500) return "The AI provider is temporarily unavailable.";
  return "The AI provider rejected the request. Check the model and provider settings.";
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  if (rateLimited(getClientKey(request))) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  let rawBody: string | null;
  try {
    rawBody = await readLimitedBody(request);
  } catch {
    return NextResponse.json({ error: "Could not read request body." }, { status: 400 });
  }
  if (rawBody === null) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (!isRecord(payload) || !("messages" in payload)) {
    return NextResponse.json({ error: "Request must include a messages array." }, { status: 400 });
  }

  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_MESSAGES} messages.` }, { status: 400 });
  }
  if (!messages.every(isChatMessage)) {
    return NextResponse.json({ error: "Messages must contain valid user or assistant text." }, { status: 400 });
  }

  const totalLength = messages.reduce((total, message) => total + message.content.length, 0);
  if (totalLength > MAX_TOTAL_LENGTH || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Conversation is too large or does not end with a user message." }, { status: 400 });
  }

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not connected yet. Configure the provider on the server." },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1200 }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });

    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: providerErrorMessage(upstream.status) },
        { status: upstream.status === 429 ? 429 : 502 },
      );
    }

    let content: unknown = null;
    if (isRecord(data) && Array.isArray(data.choices)) {
      const firstChoice: unknown = data.choices[0];
      if (isRecord(firstChoice) && isRecord(firstChoice.message)) {
        content = firstChoice.message.content;
      }
    }

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "The AI provider returned an invalid or empty response." }, { status: 502 });
    }

    return NextResponse.json(
      { message: { role: "assistant", content }, model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "The AI provider took too long to respond. Please try again."
          : "Could not reach the AI provider. Check the server configuration and try again.",
      },
      { status: 502 },
    );
  }
}
