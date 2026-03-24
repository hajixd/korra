import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAiZipModelNames } from "../../../../lib/aiZipModels";
import { fetchCopyTradeCandles } from "../../../../lib/copyTradeMarketData";
import {
  computeActiveReplaySignal,
  type CopyTradeSignalSettings,
  type CopyTradeTimeframe
} from "../../../../lib/copyTradeSignalEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CopyTradeSignalOutput = {
  desiredPosition: "BUY" | "SELL" | "FLAT";
  signalId: string;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  signalEntryTime: number | null;
  signalExitTime: number | null;
};

const timeframeSet = new Set<CopyTradeTimeframe>(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]);

const TIMEFRAME_ALIAS_TO_UI: Record<string, CopyTradeTimeframe> = {
  "1M": "1m",
  M1: "1m",
  "5M": "5m",
  M5: "5m",
  "15M": "15m",
  M15: "15m",
  "1H": "1H",
  H1: "1H",
  "4H": "4H",
  H4: "4H",
  "1D": "1D",
  D1: "1D",
  D: "1D",
  "1W": "1W",
  W1: "1W",
  W: "1W"
};

const DEFAULT_SETTINGS: CopyTradeSignalSettings = {
  symbol: "XAUUSD",
  dollarsPerMove: 25,
  chunkBars: 24,
  maxConcurrentTrades: 1,
  tpDollars: 1000,
  slDollars: 1000,
  stopMode: 0,
  breakEvenTriggerPct: 50,
  trailingStartPct: 50,
  trailingDistPct: 30
};

const toNoStoreHeaders = (contentType?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store"
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
};

const parseNumber = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null) {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
};

const parseInteger = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null) {
    return fallback;
  }

  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
};

const normalizeTimeframe = (value: string | null): CopyTradeTimeframe => {
  if (typeof value !== "string") {
    return "15m";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "15m";
  }

  const direct = trimmed as CopyTradeTimeframe;
  if (timeframeSet.has(direct)) {
    return direct;
  }

  const upper = trimmed.toUpperCase();
  return TIMEFRAME_ALIAS_TO_UI[upper] || "15m";
};

const normalizeSignalSymbol = (value: string | null): string => {
  const candidate = typeof value === "string" ? value : "";
  const normalized = candidate
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  return normalized || "XAUUSD";
};

const resolveProvidedToken = (request: Request, searchParams: URLSearchParams): string => {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return (searchParams.get("token") || "").trim();
};

const tokenMatches = (provided: string, expected: string): boolean => {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
};

const toSafePlain = (value: unknown): string => {
  return String(value ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .trim();
};

const toPlainSignalResponse = (args: {
  signal: CopyTradeSignalOutput;
  signalSymbol: string;
  timeframe: CopyTradeTimeframe;
  generatedAt: number;
}): string => {
  const { signal, signalSymbol, timeframe, generatedAt } = args;

  return [
    "ok=1",
    `action=${signal.desiredPosition}`,
    `signalId=${toSafePlain(signal.signalId)}`,
    `symbol=${signalSymbol}`,
    `timeframe=${timeframe}`,
    `entry=${signal.entryPrice ?? ""}`,
    `sl=${signal.stopLoss ?? ""}`,
    `tp=${signal.takeProfit ?? ""}`,
    `signalEntryTime=${signal.signalEntryTime ?? ""}`,
    `signalExitTime=${signal.signalExitTime ?? ""}`,
    `generatedAt=${generatedAt}`
  ].join("\n");
};

const toSignalOutput = (
  signal: ReturnType<typeof computeActiveReplaySignal>
): CopyTradeSignalOutput => {
  if (!signal) {
    return {
      desiredPosition: "FLAT",
      signalId: "",
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      signalEntryTime: null,
      signalExitTime: null
    };
  }

  return {
    desiredPosition: signal.side === "Long" ? "BUY" : "SELL",
    signalId: signal.id,
    entryPrice: Number.isFinite(signal.entryPrice) ? signal.entryPrice : null,
    stopLoss: Number.isFinite(signal.stopPrice) ? signal.stopPrice : null,
    takeProfit: Number.isFinite(signal.targetPrice) ? signal.targetPrice : null,
    signalEntryTime: Number.isFinite(signal.entryTime) ? signal.entryTime * 1000 : null,
    signalExitTime: Number.isFinite(signal.exitTime) ? signal.exitTime * 1000 : null
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").trim().toLowerCase();

  const expectedToken =
    process.env.COPYTRADE_SIGNAL_TOKEN ||
    process.env.COPY_TRADING_SIGNAL_TOKEN ||
    process.env.COPYTRADING_SIGNAL_TOKEN ||
    "";

  if (!expectedToken) {
    return NextResponse.json(
      {
        error: "Missing COPYTRADE_SIGNAL_TOKEN server env var."
      },
      {
        status: 500,
        headers: toNoStoreHeaders()
      }
    );
  }

  const providedToken = resolveProvidedToken(request, url.searchParams);
  if (!providedToken || !tokenMatches(providedToken, expectedToken)) {
    return NextResponse.json(
      {
        error: "Unauthorized."
      },
      {
        status: 401,
        headers: toNoStoreHeaders()
      }
    );
  }

  const signalSymbol = normalizeSignalSymbol(url.searchParams.get("symbol"));
  const timeframe = normalizeTimeframe(url.searchParams.get("timeframe"));
  const generatedAt = Date.now();

  const settings: CopyTradeSignalSettings = {
    symbol: signalSymbol,
    chunkBars: parseInteger(url.searchParams.get("chunkBars"), DEFAULT_SETTINGS.chunkBars, 8, 180),
    dollarsPerMove: parseNumber(
      url.searchParams.get("dollarsPerMove"),
      DEFAULT_SETTINGS.dollarsPerMove,
      1,
      5000
    ),
    tpDollars: parseNumber(url.searchParams.get("tpDollars"), DEFAULT_SETTINGS.tpDollars, 1, 100_000),
    slDollars: parseNumber(url.searchParams.get("slDollars"), DEFAULT_SETTINGS.slDollars, 1, 100_000),
    maxConcurrentTrades: parseInteger(
      url.searchParams.get("maxConcurrentTrades"),
      DEFAULT_SETTINGS.maxConcurrentTrades,
      1,
      50
    ),
    stopMode: parseInteger(url.searchParams.get("stopMode"), DEFAULT_SETTINGS.stopMode, 0, 2),
    breakEvenTriggerPct: parseNumber(
      url.searchParams.get("breakEvenTriggerPct"),
      DEFAULT_SETTINGS.breakEvenTriggerPct,
      0,
      100
    ),
    trailingStartPct: parseNumber(
      url.searchParams.get("trailingStartPct"),
      DEFAULT_SETTINGS.trailingStartPct,
      0,
      100
    ),
    trailingDistPct: parseNumber(
      url.searchParams.get("trailingDistPct"),
      DEFAULT_SETTINGS.trailingDistPct,
      0,
      100
    )
  };

  try {
    const [candles, aiZipModelNames] = await Promise.all([
      fetchCopyTradeCandles({
        symbol: signalSymbol,
        timeframe
      }),
      getAiZipModelNames()
    ]);

    const signal = toSignalOutput(
      computeActiveReplaySignal({
        candles,
        aiZipModelNames,
        settings,
        nowMs: generatedAt
      })
    );

    if (format === "plain") {
      return new NextResponse(
        toPlainSignalResponse({
          signal,
          signalSymbol,
          timeframe,
          generatedAt
        }),
        {
          status: 200,
          headers: toNoStoreHeaders("text/plain; charset=utf-8")
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        generatedAt,
        symbol: signalSymbol,
        timeframe,
        settings,
        signal
      },
      {
        headers: toNoStoreHeaders()
      }
    );
  } catch (error) {
    const message = (error as Error).message || "Signal generation failed.";

    if (format === "plain") {
      return new NextResponse(`ok=0\naction=FLAT\nerror=${toSafePlain(message)}`, {
        status: 500,
        headers: toNoStoreHeaders("text/plain; charset=utf-8")
      });
    }

    return NextResponse.json(
      {
        error: message
      },
      {
        status: 500,
        headers: toNoStoreHeaders()
      }
    );
  }
}
