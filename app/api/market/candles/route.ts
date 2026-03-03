import { NextResponse } from "next/server";

const API_BASE = "https://trading-system-delta.vercel.app/api/public/candles";
const ALLOWED_TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D", "W", "M"]);
const ALLOWED_PAIRS = new Set([
  "EUR_USD",
  "GBP_USD",
  "USD_JPY",
  "USD_CHF",
  "AUD_USD",
  "USD_CAD",
  "NZD_USD",
  "XAU_USD",
  "XAG_USD",
  "SPX500_USD",
  "BTC_USD"
]);
const MAX_UPSTREAM_LIMIT = 10000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || "XAU_USD").toUpperCase();
  const timeframe = (searchParams.get("timeframe") || "M15").toUpperCase();
  const limitRaw = searchParams.get("limit") || "500";
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 500, 10), MAX_UPSTREAM_LIMIT);

  if (!ALLOWED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });
  }

  if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  const apiKey =
    process.env.MARKET_API_KEY ||
    process.env.NEXT_PUBLIC_MARKET_API_KEY ||
    searchParams.get("api_key") ||
    "trd_PCv-kkjDo-4t4QMDNxz3JRCGIyBCKHNq";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing MARKET_API_KEY (or api_key query param)." },
      { status: 500 }
    );
  }

  const upstreamUrl = new URL(API_BASE);
  upstreamUrl.searchParams.set("pair", pair);
  upstreamUrl.searchParams.set("timeframe", timeframe);
  upstreamUrl.searchParams.set("limit", String(limit));

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Upstream error ${response.status}`,
          details: text.slice(0, 2000)
        },
        { status: response.status }
      );
    }

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": response.headers.get("X-RateLimit-Limit") || "",
        "X-RateLimit-Remaining": response.headers.get("X-RateLimit-Remaining") || "",
        "X-RateLimit-Reset": response.headers.get("X-RateLimit-Reset") || ""
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unknown error" },
      { status: 500 }
    );
  }
}
