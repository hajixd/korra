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
import { ensureTwelveDataEnvLoaded, getFallbackEnvValue } from "../../../../lib/serverEnvFallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 10000;

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

const buildTwelveDataMarketErrorResponse = (
  pair: string,
  timeframe: string,
  limit: number,
  start: string | null,
  end: string | null,
  details: string
) =>
  {
    const isAuthFailure = isTwelveDataAuthFailureMessage(details);
    const isRetryable = !isAuthFailure && isTwelveDataRetryableMessage(details);
    const retryAfterSeconds = isRetryable
      ? getTwelveDataRetryAfterSeconds(details)
      : null;

    return NextResponse.json(
      {
        error: isAuthFailure
          ? "Twelve Data authentication failed."
          : isRetryable
            ? "Twelve Data market feed is cooling down."
          : "Twelve Data market feed unavailable.",
        details,
        pair,
        timeframe,
        requestedCount: limit,
        start,
        end,
        source: "twelve-data"
      },
      {
        status: isAuthFailure ? 502 : isRetryable ? 429 : 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Korra-Market-Source": "twelve-data",
          "X-Korra-Market-Error": isAuthFailure ? "auth" : isRetryable ? "cooldown" : "upstream",
          "X-Korra-Market-Reason": toSafeHeaderValue(details),
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
  const limitRaw = searchParams.get("limit") || "500";
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 500, 10), MAX_LIMIT);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!TWELVE_DATA_SUPPORTED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });
  }
  if (!TWELVE_DATA_SUPPORTED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  try {
    if (!hasConfiguredTwelveDataApiKeys()) {
      throw new Error("Missing TWELVE_DATA_API_KEY.");
    }

    const payload = await fetchTwelveDataCandles({
      pair,
      timeframe,
      count: limit,
      start,
      end,
      apiKeys: runtimeApiKeys
    });
    return NextResponse.json(compactCandlePayload(payload), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Korra-Market-Source": "twelve-data",
        "X-Korra-Market-Requested-Limit": String(limit)
      }
    });
  } catch (error) {
    return buildTwelveDataMarketErrorResponse(
      pair,
      timeframe,
      limit,
      start,
      end,
      (error as Error).message || "Unknown Twelve Data error."
    );
  }
}
