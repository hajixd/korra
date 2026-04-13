export type StrategyNotificationHistoryTrade = {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  result: "Win" | "Loss";
  entrySource: string;
  exitReason: string;
  pnlPct: number;
  pnlUsd: number;
  time: string;
  entryAt: string;
  exitAt: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
};

export const STRATEGY_NOTIFICATION_TRADE_HISTORY_LIMIT = 200;

const normalizeString = (value: unknown, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const normalizeFiniteNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toHistoryKey = (trade: Pick<StrategyNotificationHistoryTrade, "id" | "entryTime" | "exitTime">) => {
  return `${trade.id}|${Math.trunc(Number(trade.entryTime) || 0)}|${Math.trunc(Number(trade.exitTime) || 0)}`;
};

const normalizeHistoryTrade = (value: unknown): StrategyNotificationHistoryTrade | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = normalizeString(row.id);
  const symbol = normalizeString(row.symbol);
  const side = row.side === "Short" ? "Short" : row.side === "Long" ? "Long" : null;
  const result = row.result === "Loss" ? "Loss" : row.result === "Win" ? "Win" : null;

  if (!id || !symbol || !side || !result) {
    return null;
  }

  const entryTime = Math.trunc(normalizeFiniteNumber(row.entryTime));
  const exitTime = Math.trunc(normalizeFiniteNumber(row.exitTime));

  return {
    id,
    symbol,
    side,
    result,
    entrySource: normalizeString(row.entrySource, "Notifications"),
    exitReason: normalizeString(row.exitReason, result === "Win" ? "Take Profit" : "Stop Loss"),
    pnlPct: normalizeFiniteNumber(row.pnlPct),
    pnlUsd: normalizeFiniteNumber(row.pnlUsd),
    time: normalizeString(row.time),
    entryAt: normalizeString(row.entryAt),
    exitAt: normalizeString(row.exitAt),
    entryTime,
    exitTime,
    entryPrice: normalizeFiniteNumber(row.entryPrice),
    targetPrice: normalizeFiniteNumber(row.targetPrice),
    stopPrice: normalizeFiniteNumber(row.stopPrice),
    outcomePrice: normalizeFiniteNumber(row.outcomePrice),
    units: normalizeFiniteNumber(row.units)
  };
};

export const normalizeStrategyNotificationTradeHistory = (
  value: unknown
): StrategyNotificationHistoryTrade[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const trades: StrategyNotificationHistoryTrade[] = [];

  for (const entry of value) {
    const trade = normalizeHistoryTrade(entry);
    if (!trade) {
      continue;
    }

    const key = toHistoryKey(trade);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    trades.push(trade);
  }

  return trades
    .sort(
      (left, right) =>
        Number(right.exitTime) - Number(left.exitTime) ||
        Number(right.entryTime) - Number(left.entryTime) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, STRATEGY_NOTIFICATION_TRADE_HISTORY_LIMIT);
};

export const appendStrategyNotificationTradeHistory = (
  existing: unknown,
  nextTrades: readonly StrategyNotificationHistoryTrade[]
): StrategyNotificationHistoryTrade[] => {
  return normalizeStrategyNotificationTradeHistory([
    ...(Array.isArray(nextTrades) ? nextTrades : []),
    ...normalizeStrategyNotificationTradeHistory(existing)
  ]);
};
