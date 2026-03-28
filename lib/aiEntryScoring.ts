const ENTRY_SCORING_EPS = 1e-8;

export const ENTRY_ONLY_NEIGHBOR_DIMENSIONS = [
  { key: "side", name: "Direction" },
  { key: "riskPct", name: "Risk %" },
  { key: "rewardPct", name: "Reward %" },
  { key: "riskReward", name: "Risk / Reward" },
  { key: "timeOfDayFraction", name: "Time Of Day" },
  { key: "weekdayFraction", name: "Weekday" }
] as const;

export const LEGACY_NEIGHBOR_DIMENSIONS = [
  { key: "side", name: "Direction" },
  { key: "pnlPct", name: "PnL %" },
  { key: "pnlUsd", name: "PnL $" },
  { key: "riskReward", name: "Risk / Reward" },
  { key: "holdHours", name: "Duration" },
  { key: "timeOfDayFraction", name: "Time Of Day" }
] as const;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const normalizeEpochSeconds = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (Math.abs(numeric) >= 1_000_000_000_000) {
    return numeric / 1000;
  }

  return numeric;
};

const getWeekdayFraction = (timestampSeconds: number) => {
  const date = new Date(timestampSeconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return clamp(date.getUTCDay() / 6, 0, 1);
};

export type EntryOnlyScoredTradeLike = {
  side: "Long" | "Short";
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  entryTime: number;
  exitTime?: number;
  pnlPct?: number;
  pnlUsd?: number;
  result?: "Win" | "Loss";
};

export type TradeScoringOptions = {
  inPreciseEnabled?: boolean;
};

export const getEntryOnlyTradeGeometry = (trade: EntryOnlyScoredTradeLike) => {
  const safeEntryPrice = Math.max(0.000001, Math.abs(Number(trade.entryPrice)) || 0.000001);
  const riskDistance = Math.max(
    0.000001,
    Math.abs(Number(trade.entryPrice) - Number(trade.stopPrice))
  );
  const rewardDistance = Math.max(
    0,
    Math.abs(Number(trade.targetPrice) - Number(trade.entryPrice))
  );
  const riskPct = (riskDistance / safeEntryPrice) * 100;
  const rewardPct = (rewardDistance / safeEntryPrice) * 100;
  const riskReward = rewardDistance / Math.max(ENTRY_SCORING_EPS, riskDistance);
  const timestampSeconds = normalizeEpochSeconds(trade.entryTime);
  const timeOfDayFraction =
    ((((timestampSeconds % 86_400) + 86_400) % 86_400) / 86_400);

  return {
    riskDistance,
    rewardDistance,
    riskPct,
    rewardPct,
    riskReward,
    timeOfDayFraction,
    weekdayFraction: getWeekdayFraction(timestampSeconds)
  };
};

export const buildEntryOnlyNeighborVector = (trade: EntryOnlyScoredTradeLike): number[] => {
  const geometry = getEntryOnlyTradeGeometry(trade);

  return [
    trade.side === "Long" ? 1 : -1,
    clamp(geometry.riskPct, 0, 25),
    clamp(geometry.rewardPct, 0, 25),
    clamp(geometry.riskReward, 0, 12),
    geometry.timeOfDayFraction,
    geometry.weekdayFraction
  ];
};

export const getEntryOnlyTradeConfidenceScore = (trade: EntryOnlyScoredTradeLike): number => {
  const geometry = getEntryOnlyTradeGeometry(trade);
  const rrScore = clamp(geometry.riskReward / 3, 0, 1) * 0.24;
  const riskScore = clamp(1 - geometry.riskPct / 5, 0, 1) * 0.08;
  const rewardScore = clamp(geometry.rewardPct / 10, 0, 1) * 0.06;

  return clamp(0.42 + rrScore + riskScore + rewardScore, 0.18, 0.8);
};

const getLegacyTradeGeometry = (trade: EntryOnlyScoredTradeLike) => {
  const geometry = getEntryOnlyTradeGeometry(trade);
  const entryTimeSeconds = normalizeEpochSeconds(trade.entryTime);
  const exitTimeSeconds = normalizeEpochSeconds(trade.exitTime ?? trade.entryTime);
  const holdMinutes = Math.max(0, (exitTimeSeconds - entryTimeSeconds) / 60);

  return {
    ...geometry,
    holdMinutes,
    holdHours: holdMinutes / 60
  };
};

export const buildLegacyNeighborVector = (trade: EntryOnlyScoredTradeLike): number[] => {
  const geometry = getLegacyTradeGeometry(trade);
  const pnlPct = Number.isFinite(Number(trade.pnlPct)) ? Number(trade.pnlPct) : 0;
  const pnlUsd = Number.isFinite(Number(trade.pnlUsd)) ? Number(trade.pnlUsd) : 0;

  return [
    trade.side === "Long" ? 1 : -1,
    clamp(pnlPct / 100, -2, 2),
    clamp(pnlUsd / 1000, -5, 5),
    clamp(geometry.riskReward, 0, 12),
    clamp(geometry.holdHours, 0, 24),
    geometry.timeOfDayFraction
  ];
};

export const getLegacyTradeConfidenceScore = (trade: EntryOnlyScoredTradeLike): number => {
  const geometry = getLegacyTradeGeometry(trade);
  const pnlPct = Number.isFinite(Number(trade.pnlPct)) ? Math.abs(Number(trade.pnlPct)) : 0;
  const pnlUsd = Number.isFinite(Number(trade.pnlUsd)) ? Math.abs(Number(trade.pnlUsd)) : 0;
  const result =
    trade.result === "Win" || trade.result === "Loss"
      ? trade.result
      : Number(trade.pnlUsd ?? 0) >= 0
        ? "Win"
        : "Loss";
  const outcomeBase = result === "Win" ? 0.44 : 0.26;
  const pnlPctScore = clamp(pnlPct / 0.45, 0, 1) * 0.18;
  const pnlUsdScore = clamp(pnlUsd / 1500, 0, 1) * 0.08;
  const durationScore = clamp(1 - geometry.holdMinutes / 240, 0, 1) * 0.12;
  const rrScore = clamp(geometry.riskReward / 3, 0, 1) * 0.08;

  return clamp(outcomeBase + pnlPctScore + pnlUsdScore + durationScore + rrScore, 0.18, 0.94);
};

export const buildTradeNeighborVector = (
  trade: EntryOnlyScoredTradeLike,
  options?: TradeScoringOptions
): number[] => {
  return options?.inPreciseEnabled
    ? buildEntryOnlyNeighborVector(trade)
    : buildLegacyNeighborVector(trade);
};

export const getTradeConfidenceScore = (
  trade: EntryOnlyScoredTradeLike,
  options?: TradeScoringOptions
): number => {
  return options?.inPreciseEnabled
    ? getEntryOnlyTradeConfidenceScore(trade)
    : getLegacyTradeConfidenceScore(trade);
};
