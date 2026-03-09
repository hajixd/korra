import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAIR = "XAU_USD";
const DEFAULT_STREAM_URL = "https://oanda-worker-production.up.railway.app/stream/prices";
const PAIR_RE = /^[A-Z0-9]{2,20}(?:_[A-Z0-9]{2,20})?(?:,[A-Z0-9]{2,20}(?:_[A-Z0-9]{2,20})?)*$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pairs = (searchParams.get("pairs") || DEFAULT_PAIR).toUpperCase().trim();

  if (!PAIR_RE.test(pairs)) {
    return NextResponse.json({ error: "Unsupported pair format." }, { status: 400 });
  }

  const apiKey =
    process.env.PRICE_STREAM_API_KEY ||
    process.env.NEXT_PUBLIC_PRICE_STREAM_API_KEY ||
    process.env.MARKET_API_KEY ||
    process.env.NEXT_PUBLIC_MARKET_API_KEY ||
    "trd_PCv-kkjDo-4t4QMDNxz3JRCGIyBCKHNq";
  const upstreamBase = process.env.PRICE_STREAM_URL || DEFAULT_STREAM_URL;
  const upstreamUrl = new URL(upstreamBase);
  upstreamUrl.searchParams.set("api_key", apiKey);
  upstreamUrl.searchParams.set("pairs", pairs);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: "text/event-stream"
      },
      cache: "no-store"
    });

    if (!upstream.ok || !upstream.body) {
      const body = await upstream.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Price stream unavailable (${upstream.status}).`,
          details: body.slice(0, 500)
        },
        { status: upstream.status || 502 }
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to connect to price stream." },
      { status: 502 }
    );
  }
}
