import { NextResponse } from "next/server";
import type { ChatMessage } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_TOTAL_LENGTH = 48_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

// Best-effort per-instance limiter. Use a shared store (e.g. Redis) before
// deploying multiple serverless instances or expecting reliable global limits.
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    candidate.content.trim().length > 0 &&
    candidate.content.length <= MAX_MESSAGE_LENGTH
  );
}

function getClientKey(request: Request): string {
  // Hosting platforms commonly provide x-forwarded-for. Do not use this as
  // an identity/authentication mechanism; it is only a temporary rate key.
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients may omit Origin.
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

  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) return true;
  bucket.count += 1;
  return false;
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
  if (contentLength > 64_000) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !("messages" in payload)) {
    return NextResponse.json({ error: "Request must include a messages array." }, { status: 400 });
  }

  const messages = (payload as { messages?: unknown }).messages;
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
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\\/+$/, "");
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
      body: JSON.stringify({ model, messages, temperature: 0.7 }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });

    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const providerMessage =
        data && typeof data === "object" &&
        "error" in data && data.error && typeof data.error === "object" &&
        "message" in data.error && typeof data.error.message === "string"
          ? data.error.message
          : `Provider returned HTTP ${upstream.status}.`;
      // Avoid returning provider internals, request IDs, or credential details.
      const safeMessage = upstream.status === 429
        ? "The AI provider is busy. Please try again shortly."
        : upstream.status === 401 || upstream.status === 403
          ? "The AI provider rejected the configured credentials."
          : upstream.status >= 500
            ? "The AI provider is temporarily unavailable."
            : providerMessage.slice(0, 240);
      return NextResponse.json({ error: safeMessage }, { status: upstream.status === 429 ? 429 : 502 });
    }

    const content =
      data && typeof data === "object" &&
      "choices" in data && Array.isArray(data.choices) &&
      data.choices[0] && typeof data.choices[0] === "object" &&
      "message" in data.choices[0] && data.choices[0].message &&
      typeof data.choices[0].message === "object" &&
      "content" in data.choices[0].message
        ? data.choices[0].message.content
        : null;

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
      { error: isTimeout ? "The AI provider took too long to respond. Please try again." : "Could not reach the AI provider. Check the server configuration and try again." },
      { status: 502 },
    );
  }
}
