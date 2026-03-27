const ENTRY_SCORING_EPS = 1e-8;

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
