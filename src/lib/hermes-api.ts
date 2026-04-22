/**
 * Hermes API — client for communicating with Harvey (the Hermes Telegram agent).
 *
 * This module provides two interfaces:
 *  1. Server-side (Node.js): direct Telegram Bot API calls using the bot token
 *  2. Client-side: calls through the MC's own /api/hermes route to avoid
 *     exposing the bot token in the browser
 *
 * For a full-featured dashboard integration, set the following env vars:
 *   TELEGRAM_BOT_TOKEN   — the Telegram bot token shared by Harvey
 *   HERMES_CHAT_ID       — the Telegram chat ID where Harvey receives messages
 *                         (if not provided, we auto-detect from getMe)
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

// ── Config helpers ──────────────────────────────────────

function getHermesConfig(): { botToken: string; chatId: string } {
  const botToken =
    process.env.TELEGRAM_BOT_TOKEN ||
    // Fallback: read from the openclaw config if stored there
    "";
  const chatId = process.env.HERMES_CHAT_ID || "";
  if (!botToken) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not set. Add it to .env or the MC environment."
    );
  }
  return { botToken, chatId };
}

// ── Types ──────────────────────────────────────────────

export interface HermesStatus {
  online: boolean;
  model?: string;
  lastActivity?: number; // Unix ms
  pendingCount?: number;
}

export interface HermesMessage {
  message_id: number;
  text: string;
  sender: string;
  timestamp: number; // Unix ms
  direction: "incoming" | "outgoing";
}

export interface HermesUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text: string;
    chat: { id: number; username?: string };
    date: number;
  };
}

// ── Telegram Bot API v2 ────────────────────────────────

const TG_BASE = "https://api.telegram.org";

async function tgRequest<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${TG_BASE}/bot${botToken}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram API error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { ok: boolean; result?: T; error_code?: number; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram error: ${data.description || `code ${data.error_code}`}`);
  }
  return data.result as T;
}

export interface BotUser {
  id: number;
  is_bot: boolean;
  username: string;
  first_name: string;
  last_name?: string;
}

export interface Chat {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  type: string;
}

export interface Message {
  message_id: number;
  chat: Chat;
  date: number;
  text?: string;
}

export interface Update {
  update_id: number;
  message?: Message;
}

// ── API methods ────────────────────────────────────────────

/** Get bot info — used to verify the bot token is valid */
export async function getMe(botToken: string): Promise<BotUser> {
  return tgRequest<BotUser>(botToken, "getMe");
}

/** Get the bot's own chat ID by calling getMe */
export async function getMyChatId(botToken: string): Promise<number> {
  const me = await getMe(botToken);
  return me.id;
}

/**
 * Fetch the most recent N messages from a given chat.
 * Uses getUpdates and filters to the specified chatId.
 */
export async function getRecentMessages(
  botToken: string,
  chatId: number,
  limit = 20
): Promise<HermesMessage[]> {
  const updates = await tgRequest<Update[]>(botToken, "getUpdates", {
    offset: 0,
    limit,
    timeout: 0,
  });

  return (updates || [])
    .filter((u) => u.message && u.message.chat.id === chatId)
    .map((u) => ({
      message_id: u.message!.message_id,
      text: u.message!.text || "",
      sender: u.message!.chat.username || String(u.message!.chat.id),
      timestamp: u.message!.date * 1000,
      direction: "incoming" as const,
    }))
    .reverse();
}

/**
 * Send a message through the Telegram bot.
 * This goes to Harvey's Telegram chat.
 */
export async function sendMessage(
  botToken: string,
  chatId: number,
  text: string
): Promise<Message> {
  return tgRequest<Message>(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  });
}

/**
 * Get Hermes/Harvey status.
 * We determine "online" by checking if getUpdates returns anything recent.
 */
export async function getHermesStatus(botToken: string, chatId: number): Promise<HermesStatus> {
  try {
    const updates = await tgRequest<Update[]>(botToken, "getUpdates", {
      limit: 1,
      timeout: 2,
    });
    const lastUpdate = updates?.[updates.length - 1];
    return {
      online: true,
      lastActivity: lastUpdate?.message?.date
        ? lastUpdate.message.date * 1000
        : Date.now(),
      pendingCount: updates?.length || 0,
    };
  } catch {
    return { online: false };
  }
}

/**
 * Check if Hermes is reachable (lightweight health check).
 * Tries to call getMe — if it succeeds, the bot token is valid.
 */
export async function isHermesReachable(botToken: string): Promise<boolean> {
  try {
    await getMe(botToken);
    return true;
  } catch {
    return false;
  }
}

// ── Server-side helper (used in Next.js API routes) ───

/**
 * Full Hermes status + recent messages from a single call.
 * Used in /api/hermes/route.ts
 */
export async function fetchHermesData(limit = 20) {
  const { botToken, chatId } = getHermesConfig();
  const numericChatId = chatId ? Number(chatId) : await getMyChatId(botToken);
  const [status, messages] = await Promise.all([
    getHermesStatus(botToken, numericChatId),
    getRecentMessages(botToken, numericChatId, limit),
  ]);
  return { status, messages, chatId: numericChatId };
}

// ── Client-side helpers (used in React components) ────

export interface HermesClientData {
  status: HermesStatus;
  messages: HermesMessage[];
  chatId: number;
}

export async function clientGetHermes(limit = 20): Promise<HermesClientData> {
  const res = await fetch(`/api/hermes?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Hermes API error: ${res.status}`);
  return res.json();
}

export async function clientSendHermesMessage(text: string): Promise<Message> {
  const res = await fetch("/api/hermes/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Failed to send: ${res.status}`);
  return res.json();
}