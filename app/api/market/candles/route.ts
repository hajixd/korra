import { NextResponse } from "next/server";
import { GET as getHistoryCandles } from "../../history/candles/route";

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
const UPSTREAM_TIMEOUT_MS = 3000;

const buildHistoryFallbackRequest = (
  request: Request,
  pair: string,
  timeframe: string,
  limit: number
) => {
  const fallbackUrl = new URL(request.url);
  fallbackUrl.pathname = "/api/history/candles";
  fallbackUrl.searchParams.set("pair", pair);
  fallbackUrl.searchParams.set("timeframe", timeframe);
  fallbackUrl.searchParams.set("count", String(limit));
  fallbackUrl.searchParams.delete("limit");
  fallbackUrl.searchParams.delete("api_key");

  return new Request(fallbackUrl.toString(), {
    method: "GET",
    headers: request.headers
  });
};

const buildEmptyCandlesResponse = (
  pair: string,
  timeframe: string,
  limit: number,
  details?: string
) =>
  NextResponse.json(
    {
      pair,
      timeframe,
      count: 0,
      requestedLimit: limit,
      candles: [],
      source: "market-fallback",
      error: details || "Market feed unavailable."
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Korra-Market-Source": "empty-fallback"
      }
    }
  );

const fallbackToHistory = async (
  request: Request,
  pair: string,
  timeframe: string,
  limit: number,
  reason: string
) => {
  try {
    const historyResponse = await getHistoryCandles(
      buildHistoryFallbackRequest(request, pair, timeframe, limit)
    );
    const body = await historyResponse.text();

    if (!historyResponse.ok) {
      return buildEmptyCandlesResponse(pair, timeframe, limit, reason);
    }

    const headers = new Headers(historyResponse.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Korra-Market-Source", "history-fallback");
    headers.set("X-Korra-Market-Reason", reason);
    return new Response(body, {
      status: historyResponse.status,
      headers
    });
  } catch {
    return buildEmptyCandlesResponse(pair, timeframe, limit, reason);
  }
};

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    const text = await response.text();

    if (!response.ok) {
      return fallbackToHistory(
        request,
        pair,
        timeframe,
        limit,
        `upstream-${response.status}`
      );
    }

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Korra-Market-Source": "upstream",
        "X-RateLimit-Limit": response.headers.get("X-RateLimit-Limit") || "",
        "X-RateLimit-Remaining": response.headers.get("X-RateLimit-Remaining") || "",
        "X-RateLimit-Reset": response.headers.get("X-RateLimit-Reset") || ""
      }
    });
  } catch (error) {
    return fallbackToHistory(
      request,
      pair,
      timeframe,
      limit,
      error instanceof Error && error.name === "AbortError"
        ? "upstream-timeout"
        : (error as Error).message || "unknown-error"
    );
  }
}
