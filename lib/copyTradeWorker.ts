import { getAiZipModelNames } from "./aiZipModels";
import {
  computeActiveReplaySignal,
  type CopyTradeCandle,
  type CopyTradeTimeframe
} from "./copyTradeSignalEngine";
import {
  listCopyTradeWorkerAccounts,
  patchCopyTradeAccountRuntime,
  type CopyTradeAccountWorkerRecord
} from "./copyTradeService";
import { closeMt5Position, openMt5Position } from "./mt5Bridge";

const MARKET_API_BASE = "https://trading-system-delta.vercel.app/api/public/candles";
const MARKET_TIMEFRAME_BY_UI: Record<CopyTradeTimeframe, string> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
  "1W": "W"
};

const HISTORY_LIMIT_BY_TIMEFRAME: Record<CopyTradeTimeframe, number> = {
  "1m": 5000,
  "5m": 5000,
  "15m": 5000,
  "1H": 3000,
  "4H": 1800,
  "1D": 900,
  "1W": 240
};

const DEFAULT_LOOP_MS = 15_000;
const MIN_LOOP_MS = 5_000;
const MAX_LOOP_MS = 60_000;

const loopMs = Math.max(
  MIN_LOOP_MS,
  Math.min(MAX_LOOP_MS, Math.trunc(Number(process.env.COPY_TRADING_LOOP_MS) || DEFAULT_LOOP_MS))
);

type MarketApiCandle = {
  time: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume?: number | string;
};

let workerTimer: NodeJS.Timeout | null = null;
let workerStartedAt: number | null = null;
let tickInFlight = false;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const normalizePair = (symbol: string): string => {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) {
    return "XAU_USD";
  }
  if (normalized === "XAUUSD") {
    return "XAU_USD";
  }
  if (normalized.length === 6) {
    return `${normalized.slice(0, 3)}_${normalized.slice(3)}`;
  }
  return "XAU_USD";
};

const isXauTradingTime = (timestampMs: number): boolean => {
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();

  if (day === 6) {
    return false;
  }

  if (day === 5 && hour >= 22) {
    return false;
  }

  if (day === 0 && hour < 23) {
    return false;
  }

  if (day >= 1 && day <= 4 && hour === 22) {
    return false;
  }

  return true;
};

const normalizeMarketCandles = (candles: MarketApiCandle[], symbol: string): CopyTradeCandle[] => {
  const shouldApplyXauSchedule = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") === "XAUUSD";

  const normalized = candles
    .map((candle) => {
      let timeValue = Number.NaN;

      if (typeof candle.time === "number") {
        timeValue = candle.time;
      } else {
        const numericTime = Number(candle.time);
        timeValue = Number.isFinite(numericTime) ? numericTime : Date.parse(String(candle.time));
      }

      const time = timeValue > 1_000_000_000_000 ? timeValue : timeValue * 1000;
      const open = Number(candle.open);
      const highRaw = Number(candle.high);
      const lowRaw = Number(candle.low);
      const close = Number(candle.close);
      const volumeRaw = Number(candle.volume);
      const high = Math.max(open, highRaw, lowRaw, close);
      const low = Math.min(open, highRaw, lowRaw, close);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      if (shouldApplyXauSchedule && !isXauTradingTime(time)) {
        return null;
      }

      const output: CopyTradeCandle = {
        time,
        open,
        high,
        low,
        close
      };

      if (Number.isFinite(volumeRaw) && volumeRaw >= 0) {
        output.volume = volumeRaw;
      }

      return output;
    })
    .filter((value): value is CopyTradeCandle => value !== null)
    .sort((left, right) => left.time - right.time);

  const deduped: CopyTradeCandle[] = [];

  for (const candle of normalized) {
    const previous = deduped[deduped.length - 1];

    if (previous && previous.time === candle.time) {
      deduped[deduped.length - 1] = candle;
      continue;
    }

    deduped.push(candle);
  }

  return deduped;
};

const fetchCandlesForAccount = async (account: CopyTradeAccountWorkerRecord): Promise<CopyTradeCandle[]> => {
  const pair = normalizePair(account.symbol);
  const timeframe = MARKET_TIMEFRAME_BY_UI[account.timeframe] || "M15";
  const limit = HISTORY_LIMIT_BY_TIMEFRAME[account.timeframe] ?? 5000;
  const apiKey = process.env.MARKET_API_KEY || process.env.NEXT_PUBLIC_MARKET_API_KEY || "";

  const url = new URL(MARKET_API_BASE);
  url.searchParams.set("pair", pair);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(apiKey ? { "X-API-Key": apiKey } : {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Market candle fetch failed (${response.status}): ${errorText.slice(0, 280)}`);
  }

  const payload = (await response.json()) as { candles?: MarketApiCandle[] };
  return normalizeMarketCandles(Array.isArray(payload.candles) ? payload.candles : [], account.symbol);
};

const normalizeMt5Symbol = (symbol: string): string => {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || "XAUUSD";
};

const closePositionIfNeeded = async (account: CopyTradeAccountWorkerRecord): Promise<boolean> => {
  if (!account.openPosition) {
    return true;
  }

  try {
    await closeMt5Position({
      credentials: {
        login: account.login,
        password: account.password,
        server: account.server
      },
      providerAccountId: account.providerAccountId || undefined,
      symbol: normalizeMt5Symbol(account.symbol),
      positionTicket: account.openPosition.positionTicket,
      comment: "Korra close"
    });

    await patchCopyTradeAccountRuntime(account.id, {
      openPosition: null,
      lastActionAt: Date.now()
    });
    return true;
  } catch (error) {
    const message = (error as Error).message || "Failed to close MT5 position.";

    // If the position is already gone, clear local runtime state and continue.
    if (message.toLowerCase().includes("not found") || message.toLowerCase().includes("no position")) {
      await patchCopyTradeAccountRuntime(account.id, {
        openPosition: null,
        lastActionAt: Date.now(),
        lastError: null
      });
      return true;
    }

    await patchCopyTradeAccountRuntime(account.id, {
      status: "Error",
      lastError: message,
      lastHeartbeatAt: Date.now()
    });
    return false;
  }
};

const processCopyTradeAccount = async (
  account: CopyTradeAccountWorkerRecord,
  aiZipModelNames: string[]
): Promise<void> => {
  const heartbeat = Date.now();

  if (account.paused) {
    const pausedStatus =
      account.status === "Error"
        ? "Error"
        : account.provider === "metaapi" &&
            String(account.providerConnectionStatus || "").toUpperCase() !== "CONNECTED"
          ? "Disconnected"
          : "Connected";

    await patchCopyTradeAccountRuntime(account.id, {
      status: pausedStatus,
      lastHeartbeatAt: heartbeat,
      lastError: pausedStatus === "Error" ? account.lastError : null
    });
    return;
  }

  if (!account.password && !account.providerAccountId) {
    await patchCopyTradeAccountRuntime(account.id, {
      status: "Error",
      lastError: "Stored MT5 password could not be decrypted.",
      lastHeartbeatAt: heartbeat
    });
    return;
  }

  try {
    const candles = await fetchCandlesForAccount(account);

    if (candles.length < 64) {
      await patchCopyTradeAccountRuntime(account.id, {
        status: "Error",
        lastError: "Not enough market candles to evaluate live signal.",
        lastHeartbeatAt: heartbeat
      });
      return;
    }

    const signal = computeActiveReplaySignal({
      candles,
      aiZipModelNames,
      settings: {
        symbol: account.symbol,
        dollarsPerMove: account.dollarsPerMove,
        chunkBars: account.chunkBars,
        maxConcurrentTrades: account.maxConcurrentTrades,
        tpDollars: account.tpDollars,
        slDollars: account.slDollars,
        stopMode: account.stopMode,
        breakEvenTriggerPct: account.breakEvenTriggerPct,
        trailingStartPct: account.trailingStartPct,
        trailingDistPct: account.trailingDistPct
      },
      nowMs: heartbeat
    });

    const signalId = signal?.id ?? null;
    const signalSide = signal?.side ?? null;

    if (!signal) {
      const closed = await closePositionIfNeeded(account);
      if (!closed) {
        return;
      }

      await patchCopyTradeAccountRuntime(account.id, {
        status: "Connected",
        lastError: null,
        lastHeartbeatAt: heartbeat,
        lastSignalId: null,
        lastSignalSide: null,
        openPosition: null
      });
      return;
    }

    if (account.openPosition && account.openPosition.signalId === signal.id) {
      await patchCopyTradeAccountRuntime(account.id, {
        status: "Connected",
        lastError: null,
        lastHeartbeatAt: heartbeat,
        lastSignalId: signalId,
        lastSignalSide: signalSide
      });
      return;
    }

    const closed = await closePositionIfNeeded(account);
    if (!closed) {
      return;
    }

    const lot = clamp(account.lot, 0.01, 100);
    const openResult = await openMt5Position({
      credentials: {
        login: account.login,
        password: account.password,
        server: account.server
      },
      providerAccountId: account.providerAccountId || undefined,
      symbol: normalizeMt5Symbol(account.symbol),
      side: signal.side === "Long" ? "BUY" : "SELL",
      volume: lot,
      stopLoss: Number.isFinite(signal.stopPrice) ? signal.stopPrice : null,
      takeProfit: Number.isFinite(signal.targetPrice) ? signal.targetPrice : null,
      comment: `Korra ${signal.id.slice(-18)}`
    });

    await patchCopyTradeAccountRuntime(account.id, {
      status: "Connected",
      lastError: null,
      lastHeartbeatAt: heartbeat,
      lastSignalId: signalId,
      lastSignalSide: signalSide,
      ...(openResult.providerAccountId ? { providerAccountId: openResult.providerAccountId } : {}),
      lastActionAt: heartbeat,
      openPosition: {
        positionTicket: openResult.positionTicket,
        signalId: signal.id,
        side: signal.side,
        symbol: account.symbol,
        openedAt: heartbeat,
        entryPrice: Number.isFinite(openResult.filledPrice ?? Number.NaN)
          ? Number(openResult.filledPrice)
          : signal.entryPrice,
        takeProfit: Number.isFinite(signal.targetPrice) ? signal.targetPrice : null,
        stopLoss: Number.isFinite(signal.stopPrice) ? signal.stopPrice : null
      }
    });
  } catch (error) {
    await patchCopyTradeAccountRuntime(account.id, {
      status: "Error",
      lastError: (error as Error).message || "Copy-trade worker failed.",
      lastHeartbeatAt: heartbeat
    });
  }
};

const runWorkerTick = async (): Promise<void> => {
  if (tickInFlight) {
    return;
  }

  tickInFlight = true;

  try {
    const [accounts, aiZipModelNames] = await Promise.all([
      listCopyTradeWorkerAccounts(),
      getAiZipModelNames()
    ]);
    const liveMetaApiAccounts = accounts.filter((account) => account.provider === "metaapi");

    if (liveMetaApiAccounts.length === 0) {
      return;
    }

    for (const account of liveMetaApiAccounts) {
      await processCopyTradeAccount(account, aiZipModelNames);
    }
  } finally {
    tickInFlight = false;
  }
};

export const ensureCopyTradeWorker = (): void => {
  if (workerTimer) {
    return;
  }

  workerStartedAt = Date.now();
  workerTimer = setInterval(() => {
    void runWorkerTick();
  }, loopMs);

  void runWorkerTick();
};

export const getCopyTradeWorkerStatus = () => {
  return {
    running: workerTimer !== null,
    startedAt: workerStartedAt,
    tickInFlight,
    loopMs
  };
};
