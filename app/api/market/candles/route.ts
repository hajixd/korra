import { NextResponse } from "next/server";
import {
  DATABENTO_DEFAULT_PAIR,
  DATABENTO_SUPPORTED_PAIRS,
  DATABENTO_SUPPORTED_TIMEFRAMES,
  buildEmptyDatabentoCandlesPayload,
  fetchDatabentoCandles
} from "../../../../lib/databentoMarketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_MARKET_API_BASE =
  process.env.MARKET_API_BASE || "https://trading-system-delta.vercel.app/api/public/candles";
const MAX_LIMIT = 10000;
const MAX_RELIABLE_UPSTREAM_LIMIT = 3800;
const UPSTREAM_TIMEOUT_MS = 3000;

const buildUpstreamAttemptLimits = (requestedLimit: number): number[] => {
  const attempts = new Set<number>();
  attempts.add(Math.min(requestedLimit, MAX_RELIABLE_UPSTREAM_LIMIT));

  for (const candidate of [3000, 2000, 1500, 1000, 500]) {
    if (candidate <= requestedLimit) {
      attempts.add(candidate);
    }
  }

  return Array.from(attempts).filter((value) => value > 0);
};

const toSafeHeaderValue = (value: unknown) =>
  String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();

const buildEmptyCandlesResponse = (
  pair: string,
  timeframe: string,
  limit: number,
  start: string | null,
  end: string | null,
  details?: string
) =>
  NextResponse.json(
    buildEmptyDatabentoCandlesPayload({
      pair,
      timeframe,
      count: limit,
      start,
      end,
      details: details || "Market feed unavailable."
    }),
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Korra-Market-Source": "empty-fallback"
      }
    }
  );

const fetchLegacyMarketCandles = async (pair: string, timeframe: string, limit: number) => {
  const url = new URL(LEGACY_MARKET_API_BASE);
  url.searchParams.set("pair", pair);
  url.searchParams.set("timeframe", timeframe);

  for (const attemptLimit of buildUpstreamAttemptLimits(limit)) {
    url.searchParams.set("limit", String(attemptLimit));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        headers: {
          "X-API-Key": "trd_PCv-kkjDo-4t4QMDNxz3JRCGIyBCKHNq",
          Accept: "application/json"
        },
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        continue;
      }

      return (await response.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error("Legacy market feed unavailable.");
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || DATABENTO_DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || "M15").toUpperCase();
  const limitRaw = searchParams.get("limit") || "500";
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 500, 10), MAX_LIMIT);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!DATABENTO_SUPPORTED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });
  }
  if (!DATABENTO_SUPPORTED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  try {
    if (!process.env.DATABENTO_API_KEY) {
      throw new Error("Missing DATABENTO_API_KEY.");
    }

    const payload = await fetchDatabentoCandles({
      pair,
      timeframe,
      count: limit,
      start,
      end
    });
    return NextResponse.json(payload, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Korra-Market-Source": "databento",
        "X-Korra-Market-Requested-Limit": String(limit)
      }
    });
  } catch (databentoError) {
    try {
      const payload = await fetchLegacyMarketCandles(pair, timeframe, limit);
      return NextResponse.json(
        {
          ...payload,
          source: "legacy-market-fallback"
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Korra-Market-Source": "legacy-market-fallback",
            "X-Korra-Market-Reason": toSafeHeaderValue(
              (databentoError as Error).message || "databento-error"
            )
          }
        }
      );
    } catch (legacyError) {
      return buildEmptyCandlesResponse(
        pair,
        timeframe,
        limit,
        start,
        end,
        `Databento: ${(databentoError as Error).message || "unknown error"} | ` +
          `Legacy: ${(legacyError as Error).message || "unknown error"}`
      );
    }
  }
}
