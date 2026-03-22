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

const DEFAULT_LIMIT = 2500;
const MIN_LIMIT = 10;
const MAX_LIMIT = 300000;

const toIsoDateTime = (input: string | null) => {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
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
  const end = toIsoDateTime(
    searchParams.get("end") || searchParams.get("before") || searchParams.get("to")
  );

  if (!DATABENTO_SUPPORTED_PAIRS.has(pair)) {
    return NextResponse.json({ error: "Unsupported pair format" }, { status: 400 });
  }
  if (!DATABENTO_SUPPORTED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  if (!process.env.DATABENTO_API_KEY) {
    return NextResponse.json(
      buildEmptyDatabentoCandlesPayload({
        pair,
        timeframe,
        count,
        start,
        end,
        details: "Missing DATABENTO_API_KEY."
      }),
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Korra-History-Source": "empty-fallback"
        }
      }
    );
  }

  try {
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
    return NextResponse.json(
      buildEmptyDatabentoCandlesPayload({
        pair,
        timeframe,
        count,
        start,
        end,
        details: (error as Error).message || "Unknown Databento error."
      }),
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Korra-History-Source": "empty-fallback"
        }
      }
    );
  }
}
