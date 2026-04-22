/**
 * Lightweight gateway restart helper.
 *
 * When any component changes config (cron edits, audio settings, etc.)
 * it calls `requestRestart()` which immediately triggers a gateway restart.
 * No banner or user prompt — restarts happen automatically.
 */

import { notifyGatewayRestarting } from "@/lib/gateway-status-store";

let _pending = false;

export function requestRestart(_reason?: string): void {
  if (_pending) return;
  _pending = true;
  notifyGatewayRestarting();
  fetch("/api/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restart" }),
  })
    .catch(() => {
      // ignore — gateway status polling will detect the state
    })
    .finally(() => {
      _pending = false;
    });
}

// Keep these exports as no-ops so any remaining consumers don't break at runtime.
export function dismissRestart(): void {}
export function setRestarting(_val: boolean): void {}
export function subscribeRestartStore(listener: () => void): () => void {
  return () => {};
}
export function getRestartSnapshot() {
  return { needed: false, reason: "", restarting: false };
}
export function getServerSnapshot() {
  return { needed: false, reason: "", restarting: false };
}
