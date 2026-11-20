import { NextResponse } from "next/server";
import type { ChatMessage, ChatRequest } from "@/lib/ai/types";

export const runtime = "nodejs";

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 12_000;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.role === "user" || candidate.role === "assistant" || candidate.role === "system") &&
    typeof candidate.content === "string" &&
    candidate.content.length <= MAX_MESSAGE_LENGTH
  );
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !("messages" in payload)) {
    return NextResponse.json({ error: "Request must include a messages array." }, { status: 400 });
  }

  const body = payload as ChatRequest;
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_MESSAGES} messages.` }, { status: 400 });
  }

  if (!body.messages.every(isChatMessage)) {
    return NextResponse.json({ error: "One or more messages are invalid." }, { status: 400 });
  }

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not connected yet. Add AI_API_KEY to your local environment settings." },
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
      body: JSON.stringify({ model, messages: body.messages, temperature: 0.7 }),
      signal: AbortSignal.timeout(60_000),
    });

    const data = (await upstream.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { role?: string; content?: string } }>;
    };

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data.error?.message || `AI provider returned ${upstream.status}.` },
        { status: upstream.status === 429 ? 429 : 502 },
      );
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "The AI provider returned an empty response." }, { status: 502 });
    }

    return NextResponse.json({ message: { role: "assistant", content }, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error.";
    return NextResponse.json({ error: `Could not reach the AI provider: ${message}` }, { status: 502 });
  }
}