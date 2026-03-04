import { NextResponse } from "next/server";
import {
  computeBacktestHistoryRowsChunk,
  finalizeBacktestHistoryRows,
  type BacktestHistoryComputeRequest,
  type BacktestHistoryComputeResponse
} from "../../../backtestHistoryShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parsePayload = (value: unknown): BacktestHistoryComputeRequest | null => {
  if (!isRecord(value)) {
    return null;
  }

  const blueprints = Array.isArray(value.blueprints) ? value.blueprints : null;
  const candleSeriesBySymbol = isRecord(value.candleSeriesBySymbol)
    ? value.candleSeriesBySymbol
    : null;
  const modelNamesById = isRecord(value.modelNamesById) ? value.modelNamesById : null;

  if (!blueprints || !candleSeriesBySymbol || !modelNamesById) {
    return null;
  }

  return {
    blueprints: blueprints as BacktestHistoryComputeRequest["blueprints"],
    candleSeriesBySymbol: candleSeriesBySymbol as BacktestHistoryComputeRequest["candleSeriesBySymbol"],
    oneMinuteCandlesBySymbol: isRecord(value.oneMinuteCandlesBySymbol)
      ? (value.oneMinuteCandlesBySymbol as BacktestHistoryComputeRequest["oneMinuteCandlesBySymbol"])
      : undefined,
    minutePreciseEnabled: value.minutePreciseEnabled === true,
    modelNamesById: modelNamesById as BacktestHistoryComputeRequest["modelNamesById"],
    tpDollars: toNumber(value.tpDollars),
    slDollars: toNumber(value.slDollars),
    stopMode: Math.trunc(toNumber(value.stopMode)),
    breakEvenTriggerPct: toNumber(value.breakEvenTriggerPct),
    trailingStartPct: toNumber(value.trailingStartPct),
    trailingDistPct: toNumber(value.trailingDistPct),
    limit: Math.max(0, Math.trunc(toNumber(value.limit)))
  };
};

export async function POST(request: Request) {
  let payload: BacktestHistoryComputeRequest | null = null;

  try {
    payload = parsePayload(await request.json());
  } catch {
    payload = null;
  }

  if (!payload) {
    return NextResponse.json(
      { error: "Invalid backtest compute payload." },
      { status: 400 }
    );
  }

  try {
    const rows = finalizeBacktestHistoryRows(
      computeBacktestHistoryRowsChunk({
        blueprints: payload.blueprints,
        candleSeriesBySymbol: payload.candleSeriesBySymbol,
        oneMinuteCandlesBySymbol: payload.oneMinuteCandlesBySymbol,
        minutePreciseEnabled: payload.minutePreciseEnabled,
        modelNamesById: payload.modelNamesById,
        tpDollars: payload.tpDollars,
        slDollars: payload.slDollars,
        stopMode: payload.stopMode,
        breakEvenTriggerPct: payload.breakEvenTriggerPct,
        trailingStartPct: payload.trailingStartPct,
        trailingDistPct: payload.trailingDistPct
      }),
      payload.limit
    );

    return NextResponse.json({ rows } satisfies BacktestHistoryComputeResponse, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          (error as Error).message || "Backtest compute failed."
      },
      { status: 500 }
    );
  }
}
