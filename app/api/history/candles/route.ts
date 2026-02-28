import { NextResponse } from "next/server";

const MARKET_API_BASE = "https://trading-system-delta.vercel.app/api/public/candles";
const PRACTICE_BASE_URL = "https://api-fxpractice.oanda.com/v3";
const LIVE_BASE_URL = "https://api-fxtrade.oanda.com/v3";
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
const DEFAULT_PAIR = "XAU_USD";
const DEFAULT_TIMEFRAME = "M15";
const DEFAULT_COUNT = 2500;
const MIN_COUNT = 10;
const MAX_COUNT = 10000;
const OANDA_MAX_BATCH = 5000;
const MARKET_FALLBACK_MAX_COUNT = 2000;

type OandaCandle = {
  complete?: boolean;
  time?: string;
  volume?: number;
  mid?: {
    o?: string;
    h?: string;
    l?: string;
    c?: string;
  };
};

type HistoryCandle = {
  time: string;
  timestamp: number;
  pair: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const toIsoCursor = (input: string | null) => {
  if (!input) {
    return null;
  }

  const parsed = new Date(input);

  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const loadMarketFallback = async ({
  pair,
  timeframe,
  count
}: {
  pair: string;
  timeframe: string;
  count: number;
}) => {
  const apiKey =
    process.env.MARKET_API_KEY ||
    process.env.NEXT_PUBLIC_MARKET_API_KEY ||
    "trd_PCv-kkjDo-4t4QMDNxz3JRCGIyBCKHNq";

  const url = new URL(MARKET_API_BASE);
  url.searchParams.set("pair", pair);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("limit", String(Math.min(count, MARKET_FALLBACK_MAX_COUNT)));

  const response = await fetch(url.toString(), {
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
        error: `Fallback upstream error ${response.status}`,
        details: text.slice(0, 2000)
      },
      { status: response.status }
    );
  }

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Korra-Data-Source": "market-history-fallback",
      "X-RateLimit-Limit": response.headers.get("X-RateLimit-Limit") || "",
      "X-RateLimit-Remaining": response.headers.get("X-RateLimit-Remaining") || "",
      "X-RateLimit-Reset": response.headers.get("X-RateLimit-Reset") || ""
    }
  });
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || DEFAULT_TIMEFRAME).toUpperCase();
  const countRaw = searchParams.get("count") || String(DEFAULT_COUNT);
  const count = Math.min(
    Math.max(parseInt(countRaw, 10) || DEFAULT_COUNT, MIN_COUNT),
    MAX_COUNT
  );
  const cursorRaw =
    searchParams.get("before") || searchParams.get("end") || searchParams.get("to");
  const cursor = cursorRaw ? toIsoCursor(cursorRaw) : null;

  if (!ALLOWED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });
  }

  if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  if (cursorRaw && !cursor) {
    return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
  }

  const token = process.env.OANDA_API_TOKEN;

  if (!token) {
    return loadMarketFallback({ pair, timeframe, count });
  }

  const baseUrl = process.env.OANDA_ENV === "live" ? LIVE_BASE_URL : PRACTICE_BASE_URL;
  const candlesByTimestamp = new Map<number, HistoryCandle>();
  let nextCursor = cursor;
  let pages = 0;
  const maxPages = Math.max(1, Math.ceil(count / OANDA_MAX_BATCH) + 1);

  try {
    while (candlesByTimestamp.size < count && pages < maxPages) {
      const remaining = count - candlesByTimestamp.size;
      const batchSize = Math.min(remaining + (nextCursor ? 1 : 0), OANDA_MAX_BATCH);
      const url = new URL(`${baseUrl}/instruments/${pair}/candles`);
      url.searchParams.set("granularity", timeframe);
      url.searchParams.set("count", String(batchSize));
      url.searchParams.set("price", "M");

      if (nextCursor) {
        url.searchParams.set("to", nextCursor);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        },
        cache: "no-store"
      });

      if (!response.ok) {
        const text = await response.text();

        if (candlesByTimestamp.size > 0) {
          break;
        }

        const fallbackResponse = await loadMarketFallback({ pair, timeframe, count });

        fallbackResponse.headers.set(
          "X-Korra-Oanda-Error",
          `OANDA error ${response.status}: ${text.slice(0, 120)}`
        );

        return fallbackResponse;
      }

      const payload = (await response.json()) as { candles?: OandaCandle[] };
      const normalized = (payload.candles || [])
        .filter((candle) => candle.complete !== false && candle.time && candle.mid)
        .map((candle) => {
          const timeMs = Date.parse(String(candle.time));
          const open = Number(candle.mid?.o);
          const high = Number(candle.mid?.h);
          const low = Number(candle.mid?.l);
          const close = Number(candle.mid?.c);
          const volume = Number(candle.volume ?? 0);

          if (
            !Number.isFinite(timeMs) ||
            !Number.isFinite(open) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close)
          ) {
            return null;
          }

          return {
            time: new Date(timeMs).toISOString(),
            timestamp: timeMs,
            pair,
            timeframe,
            open,
            high,
            low,
            close,
            volume: Number.isFinite(volume) ? volume : 0
          };
        })
        .filter((candle): candle is HistoryCandle => candle !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (normalized.length === 0) {
        break;
      }

      const sizeBefore = candlesByTimestamp.size;

      for (const candle of normalized) {
        candlesByTimestamp.set(candle.timestamp, candle);
      }

      const oldest = normalized[0];
      nextCursor = oldest.time;
      pages += 1;

      if (candlesByTimestamp.size === sizeBefore || normalized.length < batchSize) {
        break;
      }
    }

    const candles = Array.from(candlesByTimestamp.values())
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-count);

    if (candles.length === 0) {
      return loadMarketFallback({ pair, timeframe, count });
    }

    return NextResponse.json(
      {
        pair,
        timeframe,
        count: candles.length,
        candles
      },
      {
        headers: {
          "X-Korra-Data-Source": "oanda-history"
        }
      }
    );
  } catch (error) {
    if (candlesByTimestamp.size > 0) {
      const candles = Array.from(candlesByTimestamp.values())
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .slice(-count);

      return NextResponse.json(
        {
          pair,
          timeframe,
          count: candles.length,
          candles
        },
        {
          headers: {
            "X-Korra-Data-Source": "oanda-history-partial"
          }
        }
      );
    }

    const fallbackResponse = await loadMarketFallback({ pair, timeframe, count });
    fallbackResponse.headers.set(
      "X-Korra-Oanda-Error",
      (error as Error).message || "Unknown error"
    );

    return fallbackResponse;
  }
}
