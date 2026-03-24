import type { BacktestHistoryRow } from "../app/backtestHistoryShared";
import { sendPushNotification } from "./firebaseServerNotifications";
import { listFirebaseUserDocuments, patchFirebaseUserDocument } from "./firebaseUserDocuments";
import { normalizeNotificationDevices, type NotificationDeviceRecord, type NotificationDeviceRuntime } from "./notificationDevices";
import {
  computeActiveStrategyNotificationSignal,
  type StrategyNotificationSettings
} from "./strategyNotificationEngine";
import { getStrategyNotificationMarketWindow } from "./strategyNotificationMarketHours";
import { fetchTwelveDataCandles } from "./twelveDataMarketData";

const MARKET_TIMEFRAME_BY_UI: Record<StrategyNotificationSettings["timeframe"], string> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
  "1W": "W"
};

const HISTORY_LIMIT_BY_TIMEFRAME: Record<StrategyNotificationSettings["timeframe"], number> = {
  "1m": 5000,
  "5m": 5000,
  "15m": 5000,
  "1H": 3000,
  "4H": 1800,
  "1D": 900,
  "1W": 240
};

export type StrategyNotificationSweepResult = {
  totalUsers: number;
  processedUsers: number;
  skippedUsers: number;
  entryNotifications: number;
  exitNotifications: number;
  errorNotifications: number;
  marketOpen: boolean;
  skipReason: "market_closed_weekend" | "market_closed_rollover" | null;
  marketTimeLabel: string;
  marketTimeZone: string;
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

const normalizeMarketCandles = (
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>
) => {
  return candles
    .map((candle) => {
      const time = Number(candle.time);
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);
      const volumeRaw = Number(candle.volume);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close,
        ...(Number.isFinite(volumeRaw) && volumeRaw >= 0 ? { volume: volumeRaw } : {})
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((left, right) => left.time - right.time);
};

const normalizeSettings = (raw: unknown): StrategyNotificationSettings | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const timeframe = String(value.timeframe ?? "").trim() as StrategyNotificationSettings["timeframe"];
  if (!(timeframe in MARKET_TIMEFRAME_BY_UI)) {
    return null;
  }

  const aiMode =
    value.aiMode === "knn" || value.aiMode === "hdbscan" ? value.aiMode : "off";

  return {
    symbol: String(value.symbol ?? "XAUUSD").trim() || "XAUUSD",
    timeframe,
    aiMode,
    aiFilterEnabled: Boolean(value.aiFilterEnabled),
    confidenceThreshold: Number(value.confidenceThreshold ?? 0) || 0,
    ancThreshold: Number(value.ancThreshold ?? 0) || 0,
    dollarsPerMove: Number(value.dollarsPerMove ?? 25) || 25,
    chunkBars: Math.max(1, Number(value.chunkBars ?? 24) || 24),
    maxBarsInTrade: Math.max(0, Number(value.maxBarsInTrade ?? 0) || 0),
    maxConcurrentTrades: Math.max(0, Number(value.maxConcurrentTrades ?? 1) || 1),
    tpDollars: Number(value.tpDollars ?? 1000) || 1000,
    slDollars: Number(value.slDollars ?? 1000) || 1000,
    stopMode: Number(value.stopMode ?? 0) || 0,
    breakEvenTriggerPct: Number(value.breakEvenTriggerPct ?? 50) || 50,
    trailingStartPct: Number(value.trailingStartPct ?? 50) || 50,
    trailingDistPct: Number(value.trailingDistPct ?? 30) || 30,
    aiModelStates:
      value.aiModelStates && typeof value.aiModelStates === "object" && !Array.isArray(value.aiModelStates)
        ? Object.fromEntries(
            Object.entries(value.aiModelStates as Record<string, unknown>).map(([key, modelState]) => [
              key,
              Number(modelState ?? 0) || 0
            ])
          )
        : {}
  };
};

const EMPTY_DEVICE_RUNTIME: NotificationDeviceRuntime = {
  lastSignalId: null,
  lastSignalSide: null,
  lastSignalEntryPrice: null,
  lastSignalTakeProfit: null,
  lastSignalStopLoss: null,
  lastSignalUnits: null,
  lastEvaluatedAt: null,
  lastError: null
};

const formatNotificationPrice = (value: number | null | undefined): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "—";
};

const formatNotificationUnits = (value: number | null | undefined): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Number(numeric.toFixed(2))) : "—";
};

const buildRowBody = (
  label: string,
  row: Pick<BacktestHistoryRow, "side" | "entryPrice" | "targetPrice" | "stopPrice" | "units">,
  symbol: string
) => {
  return [
    `${symbol} · ${row.side} ${label}`,
    `Entry Price: ${formatNotificationPrice(row.entryPrice)}`,
    `Take Profit: ${formatNotificationPrice(row.targetPrice)}`,
    `Stop Loss: ${formatNotificationPrice(row.stopPrice)}`,
    `Unit Size: ${formatNotificationUnits(row.units)}`
  ].join("\n");
};

const buildRuntimeFromSignal = (
  signal: BacktestHistoryRow | null,
  lastError: string | null,
  evaluatedAt: number
): NotificationDeviceRuntime => {
  return {
    lastSignalId: signal?.id ?? null,
    lastSignalSide: signal?.side ?? null,
    lastSignalEntryPrice: signal?.entryPrice ?? null,
    lastSignalTakeProfit: signal?.targetPrice ?? null,
    lastSignalStopLoss: signal?.stopPrice ?? null,
    lastSignalUnits: signal?.units ?? null,
    lastEvaluatedAt: evaluatedAt,
    lastError
  };
};

const fetchCandlesForSettings = async (settings: StrategyNotificationSettings) => {
  const payload = await fetchTwelveDataCandles({
    pair: normalizePair(settings.symbol),
    timeframe: MARKET_TIMEFRAME_BY_UI[settings.timeframe],
    count: HISTORY_LIMIT_BY_TIMEFRAME[settings.timeframe] ?? 5000
  });
  return normalizeMarketCandles(payload.candles);
};

const updateDeviceRecord = (
  devices: NotificationDeviceRecord[],
  token: string,
  updater: (device: NotificationDeviceRecord) => NotificationDeviceRecord
) => {
  return devices.map((device) => {
    if (device.token !== token) {
      return device;
    }
    return updater(device);
  });
};

const processUserStrategyNotifications = async (userDoc: {
  uid: string;
  data: Record<string, unknown>;
}): Promise<{
  processed: boolean;
  skipped: boolean;
  entryNotifications: number;
  exitNotifications: number;
  errorNotifications: number;
}> => {
  const devices = normalizeNotificationDevices(userDoc.data.notificationDevices);
  const fallbackUserSettings = normalizeSettings(userDoc.data.strategyNotificationSettings);
  const hasEnabledDevices = devices.some((device) => device.enabled);
  if (!hasEnabledDevices) {
    return {
      processed: false,
      skipped: true,
      entryNotifications: 0,
      exitNotifications: 0,
      errorNotifications: 0
    };
  }

  const hasAnyStrategyConfigured = devices.some((device) => device.strategySettings != null) || fallbackUserSettings != null;
  if (!hasAnyStrategyConfigured) {
    return {
      processed: false,
      skipped: true,
      entryNotifications: 0,
      exitNotifications: 0,
      errorNotifications: 0
    };
  }

  let entryNotifications = 0;
  let exitNotifications = 0;
  let errorNotifications = 0;
  let processedDeviceCount = 0;
  let nextDevices = devices.slice();
  let devicesChanged = false;
  const candleCache = new Map<string, ReturnType<typeof fetchCandlesForSettings>>();

  const getCandlesForDevice = async (settings: StrategyNotificationSettings) => {
    const cacheKey = `${settings.symbol}|${settings.timeframe}`;
    let cached = candleCache.get(cacheKey);
    if (!cached) {
      cached = fetchCandlesForSettings(settings);
      candleCache.set(cacheKey, cached);
    }
    return cached;
  };

  for (const device of devices) {
    if (!device.enabled) {
      continue;
    }

    const settings = device.strategySettings ?? fallbackUserSettings;
    if (!settings) {
      continue;
    }

    processedDeviceCount += 1;
    const evaluatedAt = Date.now();
    const previousRuntime = device.strategyRuntime ?? EMPTY_DEVICE_RUNTIME;

    try {
      const candles = await getCandlesForDevice(settings);
      const signal = computeActiveStrategyNotificationSignal({
        candles,
        settings,
        nowMs: evaluatedAt
      });

      if (previousRuntime.lastSignalId && previousRuntime.lastSignalId !== signal?.id) {
        await sendPushNotification({
          ownerUid: userDoc.uid,
          targetTokens: [device.token],
          title: `${settings.symbol} ${previousRuntime.lastSignalSide ?? "trade"} exit`,
          body: buildRowBody(
            "Exit",
            {
              side: (previousRuntime.lastSignalSide as BacktestHistoryRow["side"]) ?? "Long",
              entryPrice: previousRuntime.lastSignalEntryPrice ?? Number.NaN,
              targetPrice: previousRuntime.lastSignalTakeProfit ?? Number.NaN,
              stopPrice: previousRuntime.lastSignalStopLoss ?? Number.NaN,
              units: previousRuntime.lastSignalUnits ?? Number.NaN
            },
            settings.symbol
          ),
          link: "/",
          data: {
            eventType: "strategy_trade_closed",
            symbol: settings.symbol,
            side: previousRuntime.lastSignalSide ?? ""
          }
        });
        exitNotifications += 1;
      }

      if (signal && previousRuntime.lastSignalId !== signal.id) {
        await sendPushNotification({
          ownerUid: userDoc.uid,
          targetTokens: [device.token],
          title: `${settings.symbol} ${signal.side} entry`,
          body: buildRowBody("Entry", signal, settings.symbol),
          link: "/",
          data: {
            eventType: "strategy_trade_opened",
            symbol: settings.symbol,
            side: signal.side,
            entryPrice: formatNotificationPrice(signal.entryPrice),
            takeProfit: formatNotificationPrice(signal.targetPrice),
            stopLoss: formatNotificationPrice(signal.stopPrice),
            unitSize: formatNotificationUnits(signal.units)
          }
        });
        entryNotifications += 1;
      }

      nextDevices = updateDeviceRecord(nextDevices, device.token, (currentDevice) => ({
        ...currentDevice,
        strategySettings: settings,
        strategyRuntime: buildRuntimeFromSignal(signal, null, evaluatedAt),
        updatedAt: Math.max(currentDevice.updatedAt, evaluatedAt)
      }));
      devicesChanged = true;
    } catch (error) {
      const message = (error as Error).message || "Strategy notification worker failed.";
      if (message !== previousRuntime.lastError) {
        await sendPushNotification({
          ownerUid: userDoc.uid,
          targetTokens: [device.token],
          title: `${settings.symbol} notifications need attention`,
          body: message,
          link: "/",
          data: {
            eventType: "strategy_notification_error",
            symbol: settings.symbol
          }
        });
        errorNotifications += 1;
      }

      nextDevices = updateDeviceRecord(nextDevices, device.token, (currentDevice) => ({
        ...currentDevice,
        strategySettings: settings,
        strategyRuntime: {
          ...previousRuntime,
          lastEvaluatedAt: evaluatedAt,
          lastError: message
        },
        updatedAt: Math.max(currentDevice.updatedAt, evaluatedAt)
      }));
      devicesChanged = true;
    }
  }

  if (devicesChanged) {
    await patchFirebaseUserDocument(userDoc.uid, {
      notificationDevices: nextDevices
    });
  }

  return {
    processed: processedDeviceCount > 0,
    skipped: processedDeviceCount === 0,
    entryNotifications,
    exitNotifications,
    errorNotifications
  };
};

export const runStrategyNotificationSweep = async (): Promise<StrategyNotificationSweepResult> => {
  const marketWindow = getStrategyNotificationMarketWindow();
  const result: StrategyNotificationSweepResult = {
    totalUsers: 0,
    processedUsers: 0,
    skippedUsers: 0,
    entryNotifications: 0,
    exitNotifications: 0,
    errorNotifications: 0,
    marketOpen: marketWindow.marketOpen,
    skipReason:
      marketWindow.reason === "weekend"
        ? "market_closed_weekend"
        : marketWindow.reason === "rollover"
          ? "market_closed_rollover"
          : null,
    marketTimeLabel: marketWindow.localTimeLabel,
    marketTimeZone: marketWindow.timeZone
  };

  if (!marketWindow.marketOpen) {
    return result;
  }

  const userDocs = await listFirebaseUserDocuments();
  result.totalUsers = userDocs.length;

  for (const userDoc of userDocs) {
    const userResult = await processUserStrategyNotifications(userDoc);
    if (userResult.skipped) {
      result.skippedUsers += 1;
      continue;
    }

    if (userResult.processed) {
      result.processedUsers += 1;
    }
    result.entryNotifications += userResult.entryNotifications;
    result.exitNotifications += userResult.exitNotifications;
    result.errorNotifications += userResult.errorNotifications;
  }

  return result;
};
