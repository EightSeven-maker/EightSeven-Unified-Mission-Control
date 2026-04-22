import { NextRequest, NextResponse } from "next/server";
import { fetchHermesData, isHermesReachable } from "@/lib/hermes-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // CORS for local dev
  const origin = req.headers.get("origin");
  const headers = {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Cache-Control": "no-store",
  };

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      {
        error: "TELEGRAM_BOT_TOKEN not configured",
        message: "Set TELEGRAM_BOT_TOKEN in the MC environment to enable Harvey integration.",
      },
      { status: 503, headers }
    );
  }

  try {
    const reachable = await isHermesReachable(botToken);
    if (!reachable) {
      return NextResponse.json(
        { error: "Hermes not reachable", online: false },
        { status: 503, headers }
      );
    }

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "20"), 100);
    const data = await fetchHermesData(limit);
    return NextResponse.json(data, { headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/hermes]", message);
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}