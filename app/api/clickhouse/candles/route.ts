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

const DEFAULT_LIMIT = 2500;
const MIN_LIMIT = 10;
const MAX_LIMIT = 300000;

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

    const payload = await fetchTwelveDataCandles({
      pair,
      timeframe,
      count,
      start,
      end,
      apiKeys: runtimeApiKeys
    });
    return NextResponse.json(payload, {
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
