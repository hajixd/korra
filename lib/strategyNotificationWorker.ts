import { runCopyTradeSweep } from "./copyTradeWorker";
import { sendPushNotification } from "./firebaseServerNotifications";
import {
  listFirebaseUserDocuments,
  patchFirebaseUserDocument
} from "./firebaseUserDocuments";
import {
  normalizeNotificationDevices,
  type NotificationDeviceRecord,
  type NotificationDeviceRuntime
} from "./notificationDevices";
import { computeActiveStrategyNotificationSignal } from "./strategyNotificationEngine";
import {
  HISTORY_LIMIT_BY_TIMEFRAME,
  MARKET_TIMEFRAME_BY_UI,
  buildTradeNotificationBody,
  formatTradeNotificationPrice,
  formatTradeNotificationUnits,
  normalizeStrategyNotificationMarketCandles,
  normalizeStrategyNotificationPair,
  normalizeStrategyNotificationSettings
} from "./strategyNotificationHelpers";
import { getStrategyNotificationMarketWindow } from "./strategyNotificationMarketHours";
import { fetchTwelveDataCandles } from "./twelveDataMarketData";

export type StrategyNotificationSweepResult = {
  totalUsers: number;
  processedUsers: number;
  skippedUsers: number;
  entryNotifications: number;
  exitNotifications: number;
  errorNotifications: number;
  copyTradeTotalAccounts: number;
  copyTradeProcessedAccounts: number;
  copyTradeSkippedAccounts: number;
  copyTradeEntryActions: number;
  copyTradeExitActions: number;
  copyTradeErrorAccounts: number;
  copyTradeFatalError: string | null;
  marketOpen: boolean;
  skipReason: "market_closed_weekend" | "market_closed_rollover" | null;
  marketTimeLabel: string;
  marketTimeZone: string;
};

const EMPTY_DEVICE_RUNTIME: NotificationDeviceRuntime = {
  lastSignalId: null,
  lastSignalSide: null,
  lastSignalEntryPrice: null,
  lastSignalTakeProfit: null,
  lastSignalStopLoss: null,
  lastSignalTriggerTime: null,
  lastSignalUnits: null,
  lastEvaluatedAt: null,
  lastError: null
};

const buildRuntimeFromSignal = (
  signal: ReturnType<typeof computeActiveStrategyNotificationSignal>,
  lastError: string | null,
  evaluatedAt: number
): NotificationDeviceRuntime => {
  return {
    lastSignalId: signal?.id ?? null,
    lastSignalSide: signal?.side ?? null,
    lastSignalEntryPrice: signal?.entryPrice ?? null,
    lastSignalTakeProfit: signal?.targetPrice ?? null,
    lastSignalStopLoss: signal?.stopPrice ?? null,
    lastSignalTriggerTime:
      signal && Number.isFinite(signal.entryTime) ? signal.entryTime * 1000 : null,
    lastSignalUnits: signal?.units ?? null,
    lastEvaluatedAt: evaluatedAt,
    lastError
  };
};

const fetchCandlesForSettings = async (settings: {
  symbol: string;
  timeframe: keyof typeof MARKET_TIMEFRAME_BY_UI;
}) => {
  const payload = await fetchTwelveDataCandles({
    pair: normalizeStrategyNotificationPair(settings.symbol),
    timeframe: MARKET_TIMEFRAME_BY_UI[settings.timeframe],
    count: HISTORY_LIMIT_BY_TIMEFRAME[settings.timeframe] ?? 5000
  });
  return normalizeStrategyNotificationMarketCandles(payload.candles);
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
  const fallbackUserSettings = normalizeStrategyNotificationSettings(
    userDoc.data.strategyNotificationSettings
  );
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

  const hasAnyStrategyConfigured =
    devices.some((device) => device.strategySettings != null) || fallbackUserSettings != null;
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

  const getCandlesForDevice = async (settings: NonNullable<typeof fallbackUserSettings>) => {
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
        settings
      });

      if (previousRuntime.lastSignalId && previousRuntime.lastSignalId !== signal?.id) {
        await sendPushNotification({
          ownerUid: userDoc.uid,
          targetTokens: [device.token],
          title: `${settings.symbol} ${previousRuntime.lastSignalSide ?? "trade"} exit`,
          body: buildTradeNotificationBody({
            symbol: settings.symbol,
            side: previousRuntime.lastSignalSide ?? "Trade",
            label: "exit",
            entryPrice: previousRuntime.lastSignalEntryPrice,
            takeProfit: previousRuntime.lastSignalTakeProfit,
            stopLoss: previousRuntime.lastSignalStopLoss,
            triggerTimeMs: previousRuntime.lastSignalTriggerTime
          }),
          link: "/",
          data: {
            eventType: "strategy_trade_closed",
            symbol: settings.symbol,
            side: previousRuntime.lastSignalSide ?? "",
            entryPrice: formatTradeNotificationPrice(previousRuntime.lastSignalEntryPrice),
            takeProfit: formatTradeNotificationPrice(previousRuntime.lastSignalTakeProfit),
            stopLoss: formatTradeNotificationPrice(previousRuntime.lastSignalStopLoss),
            triggerTime: String(previousRuntime.lastSignalTriggerTime ?? "")
          }
        });
        exitNotifications += 1;
      }

      if (signal && previousRuntime.lastSignalId !== signal.id) {
        await sendPushNotification({
          ownerUid: userDoc.uid,
          targetTokens: [device.token],
          title: `${settings.symbol} ${signal.side} entry`,
          body: buildTradeNotificationBody({
            symbol: settings.symbol,
            side: signal.side,
            label: "entry",
            entryPrice: signal.entryPrice,
            takeProfit: signal.targetPrice,
            stopLoss: signal.stopPrice,
            triggerTimeMs: signal.entryTime * 1000
          }),
          link: "/",
          data: {
            eventType: "strategy_trade_opened",
            symbol: settings.symbol,
            side: signal.side,
            entryPrice: formatTradeNotificationPrice(signal.entryPrice),
            takeProfit: formatTradeNotificationPrice(signal.targetPrice),
            stopLoss: formatTradeNotificationPrice(signal.stopPrice),
            triggerTime: String(signal.entryTime * 1000),
            unitSize: formatTradeNotificationUnits(signal.units)
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
    copyTradeTotalAccounts: 0,
    copyTradeProcessedAccounts: 0,
    copyTradeSkippedAccounts: 0,
    copyTradeEntryActions: 0,
    copyTradeExitActions: 0,
    copyTradeErrorAccounts: 0,
    copyTradeFatalError: null,
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

  try {
    const copyTradeResult = await runCopyTradeSweep();
    result.copyTradeTotalAccounts = copyTradeResult.totalAccounts;
    result.copyTradeProcessedAccounts = copyTradeResult.processedAccounts;
    result.copyTradeSkippedAccounts = copyTradeResult.skippedAccounts;
    result.copyTradeEntryActions = copyTradeResult.entryActions;
    result.copyTradeExitActions = copyTradeResult.exitActions;
    result.copyTradeErrorAccounts = copyTradeResult.errorAccounts;
  } catch (error) {
    result.copyTradeFatalError =
      (error as Error).message || "Copy-trade sweep failed.";
  }

  return result;
};
