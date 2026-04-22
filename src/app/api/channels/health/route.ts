import { NextRequest, NextResponse } from "next/server";
import { gatewayCall } from "@/lib/openclaw";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * GET /api/channels/health?channel=telegram
 *
 * Checks if the gateway is responsive. Optionally accepts a `channel`
 * query param to verify that specific channel shows as running/configured.
 * Used by the frontend after a config.patch (which restarts the gateway)
 * to know when it's safe to proceed with pairing.
 */
export async function GET(request: NextRequest) {
  try {
    const result = await gatewayCall<Record<string, unknown>>(
      "channels.status",
      {},
      8000,
    );

    if (!result || typeof result !== "object") {
      return NextResponse.json({ ok: false }, { status: 503 });
    }

    // If a specific channel was requested, check its status
    const channel = request.nextUrl.searchParams.get("channel");
    if (channel) {
      const channels = isRecord(result.channels) ? result.channels : {};
      const accounts = isRecord(result.channelAccounts) ? result.channelAccounts : {};
      const chStatus = isRecord(channels[channel]) ? channels[channel] as Record<string, unknown> : null;
      const chAccounts = Array.isArray(accounts[channel]) ? accounts[channel] as unknown[] : [];

      const channelReady =
        chStatus?.running === true ||
        chStatus?.configured === true ||
        chAccounts.some((a) => isRecord(a) && (a.running === true || a.configured === true));

      return NextResponse.json({ ok: true, channelReady });
    }

    return NextResponse.json({ ok: true, hasChannels: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
