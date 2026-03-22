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

const MAX_LIMIT = 10000;

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
  if (!process.env.DATABENTO_API_KEY) {
    return buildEmptyCandlesResponse(pair, timeframe, limit, start, end, "Missing DATABENTO_API_KEY.");
  }

  try {
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
  } catch (error) {
    return buildEmptyCandlesResponse(
      pair,
      timeframe,
      limit,
      start,
      end,
      (error as Error).message || "Databento market feed unavailable."
    );
  }
}
