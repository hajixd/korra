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
import { computeStrategyNotificationRowsWithAiLibraries } from "./strategyNotificationAiReplay";
import { selectActiveStrategyNotificationSignal } from "./strategyNotificationEngine";
import {
  buildStrategyNotificationHistoryRequest,
  MARKET_TIMEFRAME_BY_UI,
  buildTradeNotificationBody,
  formatTradeNotificationPrice,
  formatTradeNotificationUnits,
  normalizeStrategyNotificationMarketCandles,
  normalizeStrategyNotificationPair,
  normalizeStrategyNotificationSettings,
  serializeStrategyNotificationSettings
} from "./strategyNotificationHelpers";
import { getStrategyNotificationMarketWindow } from "./strategyNotificationMarketHours";
import {
  appendStrategyNotificationTradeHistory,
  normalizeStrategyNotificationTradeHistory,
  type StrategyNotificationHistoryTrade
} from "./strategyNotificationTradeHistory";
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
  signal: ReturnType<typeof selectActiveStrategyNotificationSignal>,
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
  count: number;
  start?: string | null;
  end?: string | null;
}) => {
  const payload = await fetchTwelveDataCandles({
    pair: normalizeStrategyNotificationPair(settings.symbol),
    timeframe: MARKET_TIMEFRAME_BY_UI[settings.timeframe],
    count: settings.count,
    start: settings.start,
    end: settings.end
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

const toStrategyNotificationHistoryTrade = (
  row: Parameters<typeof selectActiveStrategyNotificationSignal>[0]["rows"][number]
): StrategyNotificationHistoryTrade => {
  return {
    id: String(row.id ?? "").trim(),
    symbol: String(row.symbol ?? "").trim(),
    side: row.side === "Short" ? "Short" : "Long",
    result: row.result === "Loss" ? "Loss" : "Win",
    entrySource: String(row.entrySource ?? "Notifications").trim() || "Notifications",
    exitReason:
      String(row.exitReason ?? "").trim() ||
      (row.result === "Loss" ? "Stop Loss" : "Take Profit"),
    pnlPct: Number(row.pnlPct) || 0,
    pnlUsd: Number(row.pnlUsd) || 0,
    time: "",
    entryAt: "",
    exitAt: "",
    entryTime: Math.trunc(Number(row.entryTime) || 0),
    exitTime: Math.trunc(Number(row.exitTime) || 0),
    entryPrice: Number(row.entryPrice) || 0,
    targetPrice: Number(row.targetPrice) || 0,
    stopPrice: Number(row.stopPrice) || 0,
    outcomePrice: Number(row.outcomePrice) || 0,
    units: Number(row.units) || 0
  };
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
  let nextTradeHistory = normalizeStrategyNotificationTradeHistory(
    userDoc.data.strategyNotificationTradeHistory
  );
  let devicesChanged = false;
  let tradeHistoryChanged = false;
  const candleCache = new Map<string, ReturnType<typeof fetchCandlesForSettings>>();

  const getCandlesForDevice = async (
    settings: NonNullable<typeof fallbackUserSettings>,
    timeframe: NonNullable<typeof fallbackUserSettings>["timeframe"],
    evaluatedAt: number
  ) => {
    const request = buildStrategyNotificationHistoryRequest({
      settings,
      timeframe,
      nowMs: evaluatedAt
    });
    const cacheKey = JSON.stringify(request);
    let cached = candleCache.get(cacheKey);
    if (!cached) {
      cached = fetchCandlesForSettings({
        symbol: settings.symbol,
        timeframe,
        count: request.count,
        start: request.start,
        end: request.end
      });
      candleCache.set(cacheKey, cached);
    }
    return cached;
  };

  const evaluationGroups = new Map<
    string,
    {
      settings: NonNullable<typeof fallbackUserSettings>;
      devices: NotificationDeviceRecord[];
    }
  >();

  for (const device of devices) {
    if (!device.enabled) {
      continue;
    }

    const settings =
      normalizeStrategyNotificationSettings(device.strategySettings) ?? fallbackUserSettings;
    if (!settings) {
      continue;
    }

    processedDeviceCount += 1;
    const signature = serializeStrategyNotificationSettings(settings);
    const existingGroup = evaluationGroups.get(signature);
    if (existingGroup) {
      existingGroup.devices.push(device);
      continue;
    }
    evaluationGroups.set(signature, {
      settings,
      devices: [device]
    });
  }

  for (const group of evaluationGroups.values()) {
    const evaluatedAt = Date.now();

    try {
      const candles = await getCandlesForDevice(group.settings, group.settings.timeframe, evaluatedAt);
      const oneMinuteCandles =
        group.settings.minutePreciseEnabled &&
        group.settings.precisionTimeframe !== group.settings.timeframe
          ? await getCandlesForDevice(
              group.settings,
              group.settings.precisionTimeframe,
              evaluatedAt
            )
          : undefined;
      const rows = computeStrategyNotificationRowsWithAiLibraries({
        candles,
        oneMinuteCandles,
        settings: group.settings
      });
      const signal =
        rows.length > 0
          ? selectActiveStrategyNotificationSignal({
              rows,
              candles,
              settings: group.settings
            })
          : null;
      const previousGroupEvaluatedAt = group.devices.reduce((latest, device) => {
        const lastEvaluatedAt = Number(device.strategyRuntime?.lastEvaluatedAt ?? 0);
        return Number.isFinite(lastEvaluatedAt) ? Math.max(latest, lastEvaluatedAt) : latest;
      }, 0);

      if (previousGroupEvaluatedAt > 0 && rows.length > 0) {
        const recentlyClosedTrades = rows
          .filter((row) => {
            const exitTimeMs = Math.trunc(Number(row.exitTime) * 1000);
            return (
              Number.isFinite(exitTimeMs) &&
              exitTimeMs > previousGroupEvaluatedAt &&
              exitTimeMs <= evaluatedAt
            );
          })
          .map((row) => toStrategyNotificationHistoryTrade(row));

        if (recentlyClosedTrades.length > 0) {
          const mergedTradeHistory = appendStrategyNotificationTradeHistory(
            nextTradeHistory,
            recentlyClosedTrades
          );

          if (JSON.stringify(mergedTradeHistory) !== JSON.stringify(nextTradeHistory)) {
            nextTradeHistory = mergedTradeHistory;
            tradeHistoryChanged = true;
          }
        }
      }

      for (const device of group.devices) {
        const previousRuntime = device.strategyRuntime ?? EMPTY_DEVICE_RUNTIME;

        if (previousRuntime.lastSignalId && previousRuntime.lastSignalId !== signal?.id) {
          await sendPushNotification({
            ownerUid: userDoc.uid,
            targetTokens: [device.token],
            title: `${group.settings.symbol} ${previousRuntime.lastSignalSide ?? "trade"} exit`,
            body: buildTradeNotificationBody({
              symbol: group.settings.symbol,
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
              symbol: group.settings.symbol,
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
            title: `${group.settings.symbol} ${signal.side} entry`,
            body: buildTradeNotificationBody({
              symbol: group.settings.symbol,
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
              symbol: group.settings.symbol,
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
          strategySettings: group.settings,
          strategyRuntime: buildRuntimeFromSignal(signal, null, evaluatedAt),
          updatedAt: Math.max(currentDevice.updatedAt, evaluatedAt)
        }));
        devicesChanged = true;
      }
    } catch (error) {
      const message = (error as Error).message || "Strategy notification worker failed.";

      for (const device of group.devices) {
        const previousRuntime = device.strategyRuntime ?? EMPTY_DEVICE_RUNTIME;
        if (message !== previousRuntime.lastError) {
          await sendPushNotification({
            ownerUid: userDoc.uid,
            targetTokens: [device.token],
            title: `${group.settings.symbol} notifications need attention`,
            body: message,
            link: "/",
            data: {
              eventType: "strategy_notification_error",
              symbol: group.settings.symbol
            }
          });
          errorNotifications += 1;
        }

        nextDevices = updateDeviceRecord(nextDevices, device.token, (currentDevice) => ({
          ...currentDevice,
          strategySettings: group.settings,
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
  }

  if (devicesChanged || tradeHistoryChanged) {
    await patchFirebaseUserDocument(userDoc.uid, {
      ...(devicesChanged ? { notificationDevices: nextDevices } : {}),
      ...(tradeHistoryChanged
        ? { strategyNotificationTradeHistory: nextTradeHistory }
        : {})
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
