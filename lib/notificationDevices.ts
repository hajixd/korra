import type { StrategyNotificationSettings } from "./strategyNotificationEngine";

export type NotificationDeviceRuntime = {
  lastSignalId: string | null;
  lastSignalSide: string | null;
  lastSignalEntryPrice: number | null;
  lastSignalTakeProfit: number | null;
  lastSignalStopLoss: number | null;
  lastSignalTriggerTime: number | null;
  lastSignalUnits: number | null;
  lastEvaluatedAt: number | null;
  lastError: string | null;
};

export type NotificationDeviceRecord = {
  token: string;
  platform: "web";
  enabled: boolean;
  userAgent: string;
  createdAt: number;
  updatedAt: number;
  strategySettings?: StrategyNotificationSettings | null;
  strategyRuntime?: NotificationDeviceRuntime | null;
};

const normalizeTimestamp = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeNullableString = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
};

const normalizeStrategyRuntime = (value: unknown): NotificationDeviceRuntime | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    lastSignalId: normalizeNullableString((value as { lastSignalId?: unknown }).lastSignalId),
    lastSignalSide: normalizeNullableString((value as { lastSignalSide?: unknown }).lastSignalSide),
    lastSignalEntryPrice: normalizeNullableNumber(
      (value as { lastSignalEntryPrice?: unknown }).lastSignalEntryPrice
    ),
    lastSignalTakeProfit: normalizeNullableNumber(
      (value as { lastSignalTakeProfit?: unknown }).lastSignalTakeProfit
    ),
    lastSignalStopLoss: normalizeNullableNumber(
      (value as { lastSignalStopLoss?: unknown }).lastSignalStopLoss
    ),
    lastSignalTriggerTime: normalizeNullableNumber(
      (value as { lastSignalTriggerTime?: unknown }).lastSignalTriggerTime
    ),
    lastSignalUnits: normalizeNullableNumber((value as { lastSignalUnits?: unknown }).lastSignalUnits),
    lastEvaluatedAt: normalizeNullableNumber(
      (value as { lastEvaluatedAt?: unknown }).lastEvaluatedAt
    ),
    lastError: normalizeNullableString((value as { lastError?: unknown }).lastError)
  };
};

export const normalizeNotificationDevices = (value: unknown): NotificationDeviceRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const now = Date.now();
  const seen = new Set<string>();
  const devices: NotificationDeviceRecord[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const token = String((entry as { token?: unknown }).token ?? "").trim();
    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    devices.push({
      token,
      platform: "web",
      enabled: (entry as { enabled?: unknown }).enabled !== false,
      userAgent: String((entry as { userAgent?: unknown }).userAgent ?? "").trim(),
      createdAt: normalizeTimestamp((entry as { createdAt?: unknown }).createdAt, now),
      updatedAt: normalizeTimestamp((entry as { updatedAt?: unknown }).updatedAt, now),
      strategySettings:
        (entry as { strategySettings?: unknown }).strategySettings &&
        typeof (entry as { strategySettings?: unknown }).strategySettings === "object" &&
        !Array.isArray((entry as { strategySettings?: unknown }).strategySettings)
          ? ((entry as { strategySettings?: StrategyNotificationSettings }).strategySettings ?? null)
          : null,
      strategyRuntime: normalizeStrategyRuntime((entry as { strategyRuntime?: unknown }).strategyRuntime)
    });
  }

  return devices
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 12);
};

export const upsertNotificationDevice = (
  existing: unknown,
  device: NotificationDeviceRecord
): NotificationDeviceRecord[] => {
  const current = normalizeNotificationDevices(existing);
  const next = current.filter((entry) => entry.token !== device.token);
  next.unshift(device);
  return normalizeNotificationDevices(next);
};

export const removeNotificationDevice = (
  existing: unknown,
  token: string
): NotificationDeviceRecord[] => {
  const normalizedToken = String(token).trim();
  if (!normalizedToken) {
    return normalizeNotificationDevices(existing);
  }

  return normalizeNotificationDevices(existing).filter((entry) => entry.token !== normalizedToken);
};
