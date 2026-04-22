import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/hermes-api";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Content-Type": "application/json",
  };

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 503, headers });
  }

  let body: { text?: unknown; chatId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  const text = typeof body.text === "string" ? body.text.trim() : undefined;
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400, headers });
  }

  const chatIdRaw = body.chatId ?? process.env.HERMES_CHAT_ID;
  const chatId = chatIdRaw ? Number(chatIdRaw) : undefined;
  if (!chatId) {
    return NextResponse.json({ error: "HERMES_CHAT_ID not set" }, { status: 503, headers });
  }

  try {
    const msg = await sendMessage(botToken, chatId, text);
    return NextResponse.json({ ok: true, message: msg }, { headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/hermes/send]", message);
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}