"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Radio,
  MessageCircle,
  Clock,
  Send,
  RefreshCw,
  Circle,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type HermesMessage,
  type HermesStatus,
  clientGetHermes,
  clientSendHermesMessage,
} from "@/lib/hermes-api";
import { useSmartPoll } from "@/hooks/use-smart-poll";
import { InlineSpinner } from "@/components/ui/loading-state";

type Status = {
  online: boolean;
  model?: string;
  lastActivity?: number;
  pendingCount?: number;
  error?: string;
};

function formatTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function MessageBubble({
  msg,
  onClick,
}: {
  msg: HermesMessage;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:border-stone-400 dark:hover:border-stone-600",
        msg.direction === "incoming"
          ? "border-stone-200 bg-stone-50 dark:border-[#2c343d] dark:bg-[#15191d]"
          : "ml-8 border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
      )}
    >
      <span className="flex items-center justify-between">
        <span className="font-medium text-emerald-700 dark:text-emerald-300">
          {msg.direction === "incoming" ? "Harvey" : "You"}
        </span>
        <span className="text-muted-foreground/50">
          {formatTime(msg.timestamp)}
        </span>
      </span>
      <span className="whitespace-pre-wrap break-words text-stone-700 dark:text-stone-200">
        {msg.text || <span className="italic text-muted-foreground/40">[no text]</span>}
      </span>
    </button>
  );
}

export function HermesPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ online: false, error: undefined });
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchHermes = useCallback(async () => {
    try {
      const data = await clientGetHermes(20);
      setStatus({
        online: data.status.online,
        model: data.status.model,
        lastActivity: data.status.lastActivity,
        pendingCount: data.status.pendingCount,
      });
      setMessages(data.messages || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not configured") || message.includes("not set")) {
        setStatus({ online: false, error: "Harvey not configured" });
      } else {
        setStatus({ online: false, error: message });
      }
    }
  }, []);

  useSmartPoll(fetchHermes, { intervalMs: 15_000 });

  useEffect(() => {
    fetchHermes();
  }, [fetchHermes]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      await clientSendHermesMessage(text);
      await new Promise((r) => setTimeout(r, 1_500));
      await fetchHermes();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus((prev) => ({ ...prev, error: message }));
      setInput(text); // restore on failure
    } finally {
      setSending(false);
    }
  }, [input, sending, fetchHermes]);

  const isConfigured = !status.error?.includes("not configured") && !status.error?.includes("not set");

  return (
    <div className="space-y-3">
      {/* ── Header ─── */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-stone-300 dark:border-[#2c343d] dark:bg-[#171a1d] dark:hover:border-[#3d4752]"
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">Harvey</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900 dark:text-sky-200">
            <Circle
              className={cn(
                "h-1.5 w-1.5",
                status.online ? "fill-emerald-500 text-emerald-500" : "text-stone-400"
              )}
            />
            {status.online ? "Online" : status.error ? "Error" : "Offline"}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-stone-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-stone-400" />
        )}
      </button>

      {/* ── Body ─── */}
      {expanded && (
        <div className="space-y-3">
          {!isConfigured ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Harvey not configured. Set <code>TELEGRAM_BOT_TOKEN</code> and{" "}
              <code>HERMES_CHAT_ID</code> in the MC environment.
            </div>
          ) : (
            <>
              {/* ── Stats row ─── */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-2 text-center dark:border-[#2c343d] dark:bg-[#15191d]">
                  <p className="text-lg font-semibold tabular-nums text-stone-800 dark:text-stone-100">
                    {messages.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Messages</p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-2 text-center dark:border-[#2c343d] dark:bg-[#15191d]">
                  <p className="text-lg font-semibold tabular-nums text-stone-800 dark:text-stone-100">
                    {status.pendingCount ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-2 text-center dark:border-[#2c343d] dark:bg-[#15191d]">
                  <p className="text-lg font-semibold tabular-nums text-stone-800 dark:text-stone-100">
                    {status.lastActivity ? formatTime(status.lastActivity) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Last seen</p>
                </div>
              </div>

              {/* ── Messages ─── */}
              <div className="flex max-h-80 min-h-20 flex-col gap-2 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-[#2c343d] dark:bg-[#0f1318]">
                {messages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/50">
                    No messages yet
                  </div>
                ) : (
                  messages.map((msg) => (
                    <MessageBubble key={msg.message_id} msg={msg} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Input ─── */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask Harvey…"
                  disabled={sending || !status.online}
                  className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-muted-foreground/50 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-300 disabled:opacity-50 dark:border-[#2c343d] dark:bg-[#15191d] dark:text-stone-100 dark:focus:border-[#3d4752] dark:focus:ring-[#3d4752]"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !input.trim() || !status.online}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* ── Status ─── */}
              <button
                type="button"
                onClick={fetchHermes}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-stone-300 hover:text-stone-600 dark:border-[#2c343d] dark:hover:border-[#3d4752] dark:hover:text-stone-300"
              >
                <RefreshCw className="h-3 w-3" />
                {status.lastActivity
                  ? `Last updated ${formatTime(Date.now())}`
                  : "Refresh"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}