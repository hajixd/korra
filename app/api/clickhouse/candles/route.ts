import { NextResponse } from "next/server";
import {
  DATABENTO_DEFAULT_PAIR,
  DATABENTO_SUPPORTED_PAIRS,
  DATABENTO_SUPPORTED_TIMEFRAMES,
  fetchDatabentoCandles
} from "../../../../lib/databentoMarketData";

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

const buildDatabentoHistoryErrorResponse = (params: {
  pair: string;
  timeframe: string;
  count: number;
  start: string | null;
  end: string | null;
  details: string;
}) => {
  const isAuthFailure =
    params.details.includes("auth_authentication_failed") ||
    params.details.toLowerCase().includes("authentication failed");

  return NextResponse.json(
    {
      error: isAuthFailure
        ? "Databento authentication failed."
        : "Databento history unavailable.",
      details: params.details,
      pair: params.pair,
      timeframe: params.timeframe,
      requestedCount: params.count,
      start: params.start,
      end: params.end,
      source: "databento",
      docs: isAuthFailure ? "https://databento.com/docs/portal/api-keys" : undefined
    },
    {
      status: isAuthFailure ? 502 : 500,
      headers: {
        "Cache-Control": "no-store",
        "X-Korra-History-Source": "databento",
        "X-Korra-History-Error": isAuthFailure ? "auth" : "upstream",
        "X-Korra-History-Reason": toSafeHeaderValue(params.details)
      }
    }
  );
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || DATABENTO_DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || "M15").toUpperCase();
  const countRaw = searchParams.get("count") || String(DEFAULT_LIMIT);
  const count = Math.min(
    Math.max(parseInt(countRaw, 10) || DEFAULT_LIMIT, MIN_LIMIT),
    MAX_LIMIT
  );
  const start = toIsoDateTime(searchParams.get("start"));
  const end = toIsoDateTime(searchParams.get("end") || searchParams.get("before") || searchParams.get("to"));

  if (!DATABENTO_SUPPORTED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair format" }, { status: 400 });
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
      count,
      start,
      end
    });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "X-Korra-History-Source": "databento"
      }
    });
  } catch (error) {
    return buildDatabentoHistoryErrorResponse({
      pair,
      timeframe,
      count,
      start,
      end,
      details: (error as Error).message || "Unknown Databento error."
    });
  }
}
