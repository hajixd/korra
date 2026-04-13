import { NextResponse } from "next/server";
import {
  TWELVE_DATA_DEFAULT_PAIR,
  TWELVE_DATA_SUPPORTED_PAIRS,
  TWELVE_DATA_SUPPORTED_TIMEFRAMES,
  fetchTwelveDataCandles,
  getTwelveDataRetryAfterSeconds,
  hasConfiguredTwelveDataApiKeys,
  isTwelveDataAuthFailureMessage,
  isTwelveDataRetryableMessage,
  setTwelveDataRuntimeApiKeys
} from "../../../../lib/twelveDataMarketData";
import { loadFirebaseBackedHistoryRange } from "../../../../lib/firebaseHistoryStorageCache";
import { ensureTwelveDataEnvLoaded, getFallbackEnvValue } from "../../../../lib/serverEnvFallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 2500;
const MIN_LIMIT = 10;
const MAX_LIMIT = 300000;
const RECENT_HISTORY_FAST_PATH_WINDOW_MS = 45 * 24 * 60 * 60_000;
const TIMEFRAME_MS: Record<string, number> = {
  M1: 60_000,
  M5: 5 * 60_000,
  M15: 15 * 60_000,
  M30: 30 * 60_000,
  H1: 60 * 60_000,
  H4: 4 * 60 * 60_000,
  D: 24 * 60 * 60_000,
  W: 7 * 24 * 60 * 60_000,
  M: 31 * 24 * 60 * 60_000
};

const toIsoDateTime = (input: string | null) => {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const toSafeHeaderValue = (value: unknown) =>
  String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();

const compactCandlePayload = (payload: Awaited<ReturnType<typeof fetchTwelveDataCandles>>) => ({
  ...payload,
  candles: payload.candles.map((candle) => [
    candle.time,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume
  ])
});

const filterCandlesToRange = (
  candles: Awaited<ReturnType<typeof fetchTwelveDataCandles>>["candles"],
  startMs: number,
  endMs: number
) => {
  return candles.filter((candle) => candle.time >= startMs && candle.time <= endMs);
};

const recentCountPayloadCoversRange = (params: {
  candles: Awaited<ReturnType<typeof fetchTwelveDataCandles>>["candles"];
  startMs: number;
  endMs: number;
  stepMs: number;
}) => {
  const { candles, startMs, endMs, stepMs } = params;
  if (!Array.isArray(candles) || candles.length === 0) {
    return false;
  }

  const earliestTime = Number(candles[0]?.time ?? Number.NaN);
  const latestTime = Number(candles[candles.length - 1]?.time ?? Number.NaN);
  const toleranceMs = Math.max(stepMs * 2, 60_000);

  return (
    Number.isFinite(earliestTime) &&
    Number.isFinite(latestTime) &&
    earliestTime <= startMs + toleranceMs &&
    latestTime >= endMs - toleranceMs
  );
};

const buildTwelveDataHistoryErrorResponse = (params: {
  pair: string;
  timeframe: string;
  count: number;
  start: string | null;
  end: string | null;
  details: string;
}) => {
  const isAuthFailure = isTwelveDataAuthFailureMessage(params.details);
  const isRetryable = !isAuthFailure && isTwelveDataRetryableMessage(params.details);
  const retryAfterSeconds = isRetryable
    ? getTwelveDataRetryAfterSeconds(params.details)
    : null;

  return NextResponse.json(
    {
      error: isAuthFailure
        ? "Twelve Data authentication failed."
        : isRetryable
          ? "Twelve Data history is cooling down."
        : "Twelve Data history unavailable.",
      details: params.details,
      pair: params.pair,
      timeframe: params.timeframe,
      requestedCount: params.count,
      start: params.start,
      end: params.end,
      source: "twelve-data"
    },
    {
      status: isAuthFailure ? 502 : isRetryable ? 429 : 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Korra-History-Source": "twelve-data",
        "X-Korra-History-Error": isAuthFailure ? "auth" : isRetryable ? "cooldown" : "upstream",
        "X-Korra-History-Reason": toSafeHeaderValue(params.details),
        ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {})
      }
    }
  );
};

export async function GET(request: Request) {
  ensureTwelveDataEnvLoaded();
  const runtimeApiKeys = 
    [getFallbackEnvValue("TWELVE_DATA_API_KEYS"), getFallbackEnvValue("TWELVE_DATA_API_KEY"), getFallbackEnvValue("TWELVEDATA_API_KEY")]
      .join(",")
      .split(/[,\r\n;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  setTwelveDataRuntimeApiKeys(runtimeApiKeys);
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || TWELVE_DATA_DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || "M15").toUpperCase();
  const countRaw = searchParams.get("count") || String(DEFAULT_LIMIT);
  const count = Math.min(
    Math.max(parseInt(countRaw, 10) || DEFAULT_LIMIT, MIN_LIMIT),
    MAX_LIMIT
  );
  const start = toIsoDateTime(searchParams.get("start"));
  const end = toIsoDateTime(searchParams.get("end") || searchParams.get("before") || searchParams.get("to"));

  if (!TWELVE_DATA_SUPPORTED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair format" }, { status: 400 });
  }
  if (!TWELVE_DATA_SUPPORTED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  try {
    if (runtimeApiKeys.length === 0) {
      throw new Error("No Twelve Data API keys were discovered by the history route.");
    }
    if (!hasConfiguredTwelveDataApiKeys()) {
      throw new Error("Missing TWELVE_DATA_API_KEY.");
    }

    const startMs = start ? Date.parse(start) : Number.NaN;
    const endMs = end ? Date.parse(end) : Number.NaN;
    const hasExactRangeRequest =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;
    const timeframeStepMs = TIMEFRAME_MS[timeframe] ?? TIMEFRAME_MS.M15;
    const estimatedRangeBars = hasExactRangeRequest
      ? Math.ceil((endMs - startMs) / Math.max(60_000, timeframeStepMs)) + 2
      : Number.POSITIVE_INFINITY;
    const shouldTryRecentFastPath =
      hasExactRangeRequest &&
      estimatedRangeBars > 0 &&
      estimatedRangeBars <= count &&
      endMs >= Date.now() - RECENT_HISTORY_FAST_PATH_WINDOW_MS;

    if (shouldTryRecentFastPath) {
      const recentPayload = await fetchTwelveDataCandles({
        pair,
        timeframe,
        count: Math.max(count, estimatedRangeBars),
        apiKeys: runtimeApiKeys
      });
      const filteredRecentCandles = filterCandlesToRange(recentPayload.candles, startMs, endMs);

      if (
        filteredRecentCandles.length > 0 &&
        recentCountPayloadCoversRange({
          candles: filteredRecentCandles,
          startMs,
          endMs,
          stepMs: timeframeStepMs
        })
      ) {
        return NextResponse.json(
          compactCandlePayload({
            pair,
            timeframe,
            start,
            end,
            count: filteredRecentCandles.length,
            candles: filteredRecentCandles,
            source: "twelve-data-recent-fast-path"
          }),
          {
            headers: {
              "Cache-Control": "no-store",
              "X-Korra-History-Source": "twelve-data-recent-fast-path"
            }
          }
        );
      }
    }

    if (hasExactRangeRequest) {
      const cachedRangeCandles = await loadFirebaseBackedHistoryRange({
        pair,
        timeframe,
        startMs,
        endMs,
        fetchRange: async ({ startMs: chunkStartMs, endMs: chunkEndMs }) => {
          const payload = await fetchTwelveDataCandles({
            pair,
            timeframe,
            count,
            start: new Date(chunkStartMs).toISOString(),
            end: new Date(chunkEndMs).toISOString(),
            apiKeys: runtimeApiKeys
          });

          return payload.candles;
        }
      });

      if (cachedRangeCandles && cachedRangeCandles.length > 0) {
        return NextResponse.json(
          compactCandlePayload({
            pair,
            timeframe,
            start,
            end,
            count: cachedRangeCandles.length,
            candles: cachedRangeCandles,
            source: "firebase-storage-cache"
          }),
          {
            headers: {
              "Cache-Control": "no-store",
              "X-Korra-History-Source": "firebase-storage-cache"
            }
          }
        );
      }
    }

    const payload = await fetchTwelveDataCandles({
      pair,
      timeframe,
      count,
      start,
      end,
      apiKeys: runtimeApiKeys
    });
    return NextResponse.json(compactCandlePayload(payload), {
      headers: {
        "Cache-Control": "no-store",
        "X-Korra-History-Source": "twelve-data"
      }
    });
  } catch (error) {
    return buildTwelveDataHistoryErrorResponse({
      pair,
      timeframe,
      count,
      start,
      end,
      details: (error as Error).message || "Unknown Twelve Data error."
    });
  }
}
