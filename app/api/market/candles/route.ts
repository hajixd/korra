import { NextResponse } from "next/server";
import {
  DATABENTO_DEFAULT_PAIR,
  DATABENTO_SUPPORTED_PAIRS,
  DATABENTO_SUPPORTED_TIMEFRAMES,
  fetchDatabentoCandles
} from "../../../../lib/databentoMarketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 10000;

const toSafeHeaderValue = (value: unknown) =>
  String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();

const buildDatabentoMarketErrorResponse = (
  pair: string,
  timeframe: string,
  limit: number,
  start: string | null,
  end: string | null,
  details: string
) =>
  {
    const isAuthFailure =
      details.includes("auth_authentication_failed") ||
      details.toLowerCase().includes("authentication failed");

    return NextResponse.json(
      {
        error: isAuthFailure
          ? "Databento authentication failed."
          : "Databento market feed unavailable.",
        details,
        pair,
        timeframe,
        requestedCount: limit,
        start,
        end,
        source: "databento",
        docs: isAuthFailure ? "https://databento.com/docs/portal/api-keys" : undefined
      },
      {
        status: isAuthFailure ? 502 : 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Korra-Market-Source": "databento",
          "X-Korra-Market-Error": isAuthFailure ? "auth" : "upstream",
          "X-Korra-Market-Reason": toSafeHeaderValue(details)
        }
      }
    );
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
  } catch (error) {
    return buildDatabentoMarketErrorResponse(
      pair,
      timeframe,
      limit,
      start,
      end,
      (error as Error).message || "Unknown Databento error."
    );
  }
}
