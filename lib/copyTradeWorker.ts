import { getAiZipModelNames } from "./aiZipModels";
import { fetchCopyTradeCandles } from "./copyTradeMarketData";
import { computeActiveReplaySignal } from "./copyTradeSignalEngine";
import {
  listCopyTradeWorkerAccounts,
  patchCopyTradeAccountRuntime,
  type CopyTradeAccountWorkerRecord
} from "./copyTradeService";
import { closeMt5Position, openMt5Position } from "./mt5Bridge";

const DEFAULT_LOOP_MS = 15_000;
const MIN_LOOP_MS = 5_000;
const MAX_LOOP_MS = 60_000;
const CRON_MANAGED_LOOP_MS = 5 * 60_000;
const cronManagedWorker =
  process.env.COPYTRADING_USE_CRON === "1" ||
  process.env.COPY_TRADING_USE_CRON === "1" ||
  Boolean(process.env.VERCEL);

const loopMs = Math.max(
  MIN_LOOP_MS,
  Math.min(MAX_LOOP_MS, Math.trunc(Number(process.env.COPY_TRADING_LOOP_MS) || DEFAULT_LOOP_MS))
);

let workerTimer: NodeJS.Timeout | null = null;
let workerStartedAt: number | null = null;
let tickInFlight = false;

export type CopyTradeSweepResult = {
  totalAccounts: number;
  processedAccounts: number;
  skippedAccounts: number;
  entryActions: number;
  exitActions: number;
  errorAccounts: number;
};

type CopyTradeAccountSweepResult = {
  processed: boolean;
  skipped: boolean;
  entryActions: number;
  exitActions: number;
  error: boolean;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const normalizeMt5Symbol = (symbol: string): string => {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || "XAUUSD";
};

const closePositionIfNeeded = async (
  account: CopyTradeAccountWorkerRecord,
  symbolOverride?: string
): Promise<boolean> => {
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
      symbol: normalizeMt5Symbol(symbolOverride || account.openPosition.symbol || account.symbol),
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
): Promise<CopyTradeAccountSweepResult> => {
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
    return {
      processed: false,
      skipped: true,
      entryActions: 0,
      exitActions: 0,
      error: false
    };
  }

  if (!account.password && !account.providerAccountId) {
    await patchCopyTradeAccountRuntime(account.id, {
      status: "Error",
      lastError: "Stored MT5 password could not be decrypted.",
      lastHeartbeatAt: heartbeat
    });
    return {
      processed: true,
      skipped: false,
      entryActions: 0,
      exitActions: 0,
      error: true
    };
  }

  try {
    const candles = await fetchCopyTradeCandles({
      symbol: account.symbol,
      timeframe: account.timeframe
    });

    if (candles.length < 64) {
      await patchCopyTradeAccountRuntime(account.id, {
        status: "Error",
        lastError: "Not enough market candles to evaluate live signal.",
        lastHeartbeatAt: heartbeat
      });
      return {
        processed: true,
        skipped: false,
        entryActions: 0,
        exitActions: 0,
        error: true
      };
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
    const hadOpenPosition = Boolean(account.openPosition);

    if (!signal) {
      const closed = await closePositionIfNeeded(account);
      if (!closed) {
        return {
          processed: true,
          skipped: false,
          entryActions: 0,
          exitActions: 0,
          error: true
        };
      }

      await patchCopyTradeAccountRuntime(account.id, {
        status: "Connected",
        lastError: null,
        lastHeartbeatAt: heartbeat,
        lastSignalId: null,
        lastSignalSide: null,
        openPosition: null
      });
      return {
        processed: true,
        skipped: false,
        entryActions: 0,
        exitActions: hadOpenPosition ? 1 : 0,
        error: false
      };
    }

    if (account.openPosition && account.openPosition.signalId === signal.id) {
      await patchCopyTradeAccountRuntime(account.id, {
        status: "Connected",
        lastError: null,
        lastHeartbeatAt: heartbeat,
        lastSignalId: signalId,
        lastSignalSide: signalSide
      });
      return {
        processed: true,
        skipped: false,
        entryActions: 0,
        exitActions: 0,
        error: false
      };
    }

    const closed = await closePositionIfNeeded(account, account.symbol);
    if (!closed) {
      return {
        processed: true,
        skipped: false,
        entryActions: 0,
        exitActions: 0,
        error: true
      };
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
        units: signal.units,
        entryPrice: Number.isFinite(openResult.filledPrice ?? Number.NaN)
          ? Number(openResult.filledPrice)
          : signal.entryPrice,
        takeProfit: Number.isFinite(signal.targetPrice) ? signal.targetPrice : null,
        stopLoss: Number.isFinite(signal.stopPrice) ? signal.stopPrice : null
      }
    });
    return {
      processed: true,
      skipped: false,
      entryActions: 1,
      exitActions: hadOpenPosition ? 1 : 0,
      error: false
    };
  } catch (error) {
    await patchCopyTradeAccountRuntime(account.id, {
      status: "Error",
      lastError: (error as Error).message || "Copy-trade worker failed.",
      lastHeartbeatAt: heartbeat
    });
    return {
      processed: true,
      skipped: false,
      entryActions: 0,
      exitActions: 0,
      error: true
    };
  }
};

export const runCopyTradeSweep = async (): Promise<CopyTradeSweepResult> => {
  if (tickInFlight) {
    return {
      totalAccounts: 0,
      processedAccounts: 0,
      skippedAccounts: 0,
      entryActions: 0,
      exitActions: 0,
      errorAccounts: 0
    };
  }

  tickInFlight = true;
  if (workerStartedAt == null) {
    workerStartedAt = Date.now();
  }

  try {
    const [accounts, aiZipModelNames] = await Promise.all([
      listCopyTradeWorkerAccounts(),
      getAiZipModelNames()
    ]);
    const liveMetaApiAccounts = accounts.filter((account) => account.provider === "metaapi");
    const result: CopyTradeSweepResult = {
      totalAccounts: liveMetaApiAccounts.length,
      processedAccounts: 0,
      skippedAccounts: 0,
      entryActions: 0,
      exitActions: 0,
      errorAccounts: 0
    };

    if (liveMetaApiAccounts.length === 0) {
      return result;
    }

    for (const account of liveMetaApiAccounts) {
      const accountResult = await processCopyTradeAccount(account, aiZipModelNames);
      if (accountResult.processed) {
        result.processedAccounts += 1;
      }
      if (accountResult.skipped) {
        result.skippedAccounts += 1;
      }
      result.entryActions += accountResult.entryActions;
      result.exitActions += accountResult.exitActions;
      if (accountResult.error) {
        result.errorAccounts += 1;
      }
    }

    return result;
  } finally {
    tickInFlight = false;
  }
};

const runWorkerTick = async (): Promise<void> => {
  await runCopyTradeSweep();
};

export const ensureCopyTradeWorker = (): void => {
  if (cronManagedWorker) {
    if (workerStartedAt == null) {
      workerStartedAt = Date.now();
    }
    return;
  }

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
    running: cronManagedWorker || workerTimer !== null,
    startedAt: workerStartedAt,
    tickInFlight,
    loopMs: cronManagedWorker ? CRON_MANAGED_LOOP_MS : loopMs
  };
};
