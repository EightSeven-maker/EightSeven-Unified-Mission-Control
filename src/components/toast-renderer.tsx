"use client";

import { useSyncExternalStore, useCallback } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationStore, type AppNotification } from "@/lib/notification-store";

const SEVERITY_STYLES: Record<string, { icon: typeof Info; bg: string; border: string; text: string }> = {
  error: {
    icon: AlertCircle,
    bg: "bg-red-50 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/20",
    text: "text-red-600 dark:text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
  },
  success: {
    icon: CheckCircle,
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/20",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/20",
    text: "text-blue-600 dark:text-blue-400",
  },
};

function Toast({ notification }: { notification: AppNotification }) {
  const style = SEVERITY_STYLES[notification.severity] || SEVERITY_STYLES.info;
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-80 items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full fade-in duration-200",
        style.bg,
        style.border,
      )}
      role="alert"
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.text)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-900 dark:text-[#f5f7fa]">
          {notification.title}
        </p>
        {notification.detail && (
          <p className="mt-0.5 text-xs text-stone-600 dark:text-[#a8b0ba] line-clamp-2">
            {notification.detail}
          </p>
        )}
        {notification.actions && notification.actions.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            {notification.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  action.callback();
                  notificationStore.dismiss(notification.id);
                }}
                className="rounded px-2 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-200/50 dark:text-[#c8d0da] dark:hover:bg-[#2a2f36]"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => notificationStore.dismiss(notification.id)}
        className="shrink-0 rounded p-0.5 text-stone-400 transition-colors hover:text-stone-600 dark:text-[#7a8591] dark:hover:text-[#c8d0da]"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function getToasts() {
  return notificationStore.getToasts();
}

const emptyToasts: AppNotification[] = [];

export function ToastRenderer() {
  const toasts = useSyncExternalStore(
    notificationStore.subscribe,
    getToasts,
    () => emptyToasts,
  );

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex flex-col gap-2">
      {toasts.slice(0, 5).map((toast) => (
        <Toast key={toast.id} notification={toast} />
      ))}
    </div>
  );
}
