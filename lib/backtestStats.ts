export type BacktestStatsTrade = {
  result: "Win" | "Loss";
  pnlUsd: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  units: number;
};

export type BacktestSummaryStats = {
  tradeCount: number;
  netPnl: number;
  totalPnl: number;
  winRate: number;
  profitFactor: number;
  avgPnl: number;
  avgHoldMinutes: number;
  avgWinDurationMin: number;
  avgLossDurationMin: number;
  avgR: number;
  avgWin: number;
  avgLoss: number;
  averageConfidence: number;
  tradesPerDay: number;
  tradesPerWeek: number;
  tradesPerMonth: number;
  consistencyPerDay: number;
  consistencyPerWeek: number;
  consistencyPerMonth: number;
  consistencyPerTrade: number;
  avgPnlPerDay: number;
  avgPnlPerWeek: number;
  avgPnlPerMonth: number;
  avgPeakPerTrade: number;
  avgMaxDrawdownPerTrade: number;
  avgTimeInProfitMin: number;
  avgTimeInDeficitMin: number;
  sharpe: number;
  sortino: number;
  wins: number;
  losses: number;
  grossWins: number;
  grossLosses: number;
  maxWin: number;
  maxLoss: number;
  maxDrawdown: number;
  bestDay: { key: string; count: number; pnl: number } | null;
  worstDay: { key: string; count: number; pnl: number } | null;
};

export type BacktestSummaryRange = {
  startYmd?: string | null;
  endYmd?: string | null;
};

const MS_PER_DAY = 86_400_000;
const AVG_DAYS_PER_MONTH = 365.2425 / 12;

const parseUtcYmdStart = (value: string | null | undefined): number | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);

  return Number.isFinite(ms) ? ms : null;
};

const resolveCoverageSpanDays = (
  trades: BacktestStatsTrade[],
  range?: BacktestSummaryRange
): number | null => {
  const rangeStartMs = parseUtcYmdStart(range?.startYmd);
  const rangeEndBaseMs = parseUtcYmdStart(range?.endYmd);
  const rangeEndMs = rangeEndBaseMs == null ? null : rangeEndBaseMs + MS_PER_DAY - 1;

  let startMs = rangeStartMs;
  let endMs = rangeEndMs;

  if ((startMs == null || endMs == null) && trades.length > 0) {
    const exitTimesMs = trades
      .map((trade) => Number(trade.exitTime) * 1000)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right);

    if (exitTimesMs.length > 0) {
      if (startMs == null) {
        startMs = exitTimesMs[0]!;
      }

      if (endMs == null) {
        endMs = exitTimesMs[exitTimesMs.length - 1]!;
      }
    }
  }

  if (startMs == null || endMs == null) {
    return null;
  }

  if (endMs < startMs) {
    const nextStart = endMs;
    endMs = startMs;
    startMs = nextStart;
  }

  const normalizedStartMs = Math.floor(startMs / MS_PER_DAY) * MS_PER_DAY;
  const normalizedEndMs = Math.floor(endMs / MS_PER_DAY) * MS_PER_DAY;

  return Math.max(1, Math.floor((normalizedEndMs - normalizedStartMs) / MS_PER_DAY) + 1);
};

export const getTradeDayKey = (timestampSeconds: number): string => {
  return new Date(Number(timestampSeconds) * 1000).toISOString().slice(0, 10);
};

export const getTradeMonthKey = (timestampSeconds: number): string => {
  return getTradeDayKey(timestampSeconds).slice(0, 7);
};

export const getTradeWeekKey = (timestampSeconds: number): string => {
  const date = new Date(Number(timestampSeconds) * 1000);
  const day = date.getUTCDay();
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)
  );

  return weekStart.toISOString().slice(0, 10);
};

export const summarizeBacktestTrades = <TTrade extends BacktestStatsTrade>(
  trades: TTrade[],
  confidenceResolver: (trade: TTrade) => number,
  range?: BacktestSummaryRange
): BacktestSummaryStats => {
  let netPnl = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let wins = 0;
  let losses = 0;
  let totalHoldMinutes = 0;
  let totalWinHoldMinutes = 0;
  let totalLossHoldMinutes = 0;
  let maxWin = 0;
  let maxLoss = 0;
  let totalR = 0;
  let totalConfidence = 0;
  let estimatedPeakTotal = 0;
  let estimatedDrawdownTotal = 0;
  let estimatedProfitMinutes = 0;
  let estimatedDeficitMinutes = 0;
  let runningPnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;
  const dayMap = new Map<string, { key: string; count: number; pnl: number }>();
  const weekMap = new Map<string, { key: string; count: number; pnl: number }>();
  const monthMap = new Map<string, { key: string; count: number; pnl: number }>();
  const pnlSeries: number[] = [];

  for (const trade of trades) {
    const holdMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
    const targetPotentialUsd =
      Math.abs(trade.targetPrice - trade.entryPrice) * Math.max(1, trade.units);
    const stopPotentialUsd =
      Math.abs(trade.entryPrice - trade.stopPrice) * Math.max(1, trade.units);
    const favorableShare = trade.result === "Win" ? 0.68 : 0.32;
    const normalizedPnl = Number.isFinite(trade.pnlUsd) ? trade.pnlUsd : 0;
    const isWinningTrade = normalizedPnl > 0 || (normalizedPnl === 0 && trade.result === "Win");
    const isLosingTrade = normalizedPnl < 0 || (normalizedPnl === 0 && trade.result === "Loss");

    netPnl += normalizedPnl;
    runningPnl += normalizedPnl;
    peakPnl = Math.max(peakPnl, runningPnl);
    maxDrawdown = Math.min(maxDrawdown, runningPnl - peakPnl);
    maxWin = Math.max(maxWin, normalizedPnl);
    maxLoss = Math.min(maxLoss, normalizedPnl);
    totalHoldMinutes += holdMinutes;
    totalConfidence += confidenceResolver(trade) * 100;
    estimatedPeakTotal += Math.max(Math.max(normalizedPnl, 0), targetPotentialUsd);
    estimatedDrawdownTotal += Math.max(Math.abs(Math.min(normalizedPnl, 0)), stopPotentialUsd);
    estimatedProfitMinutes += holdMinutes * favorableShare;
    estimatedDeficitMinutes += holdMinutes * (1 - favorableShare);
    pnlSeries.push(normalizedPnl);

    if (isWinningTrade) {
      grossWins += normalizedPnl;
      wins += 1;
      totalWinHoldMinutes += holdMinutes;
    } else if (isLosingTrade) {
      grossLosses += normalizedPnl;
      losses += 1;
      totalLossHoldMinutes += holdMinutes;
    }

    const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
    const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
    totalR += rewardDistance / riskDistance;

    const dayKey = getTradeDayKey(trade.exitTime);
    const currentDay = dayMap.get(dayKey) ?? { key: dayKey, count: 0, pnl: 0 };
    currentDay.count += 1;
    currentDay.pnl += normalizedPnl;
    dayMap.set(dayKey, currentDay);

    const weekKey = getTradeWeekKey(trade.exitTime);
    const currentWeek = weekMap.get(weekKey) ?? { key: weekKey, count: 0, pnl: 0 };
    currentWeek.count += 1;
    currentWeek.pnl += normalizedPnl;
    weekMap.set(weekKey, currentWeek);

    const monthKey = getTradeMonthKey(trade.exitTime);
    const currentMonth = monthMap.get(monthKey) ?? { key: monthKey, count: 0, pnl: 0 };
    currentMonth.count += 1;
    currentMonth.pnl += normalizedPnl;
    monthMap.set(monthKey, currentMonth);
  }

  const dayRows = Array.from(dayMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const weekRows = Array.from(weekMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const monthRows = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  const bestDay = [...dayRows].sort((a, b) => b.pnl - a.pnl)[0] ?? null;
  const worstDay = [...dayRows].sort((a, b) => a.pnl - b.pnl)[0] ?? null;
  const tradeCount = trades.length;
  const avgPnl = tradeCount > 0 ? netPnl / tradeCount : 0;
  const avgWin = wins > 0 ? grossWins / wins : 0;
  const avgLoss = losses > 0 ? grossLosses / losses : 0;
  const mean = avgPnl;
  const variance =
    tradeCount > 0
      ? pnlSeries.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, tradeCount)
      : 0;
  const stdDev = Math.sqrt(variance);
  const downsideValues = pnlSeries.filter((value) => value < 0);
  const downsideVariance =
    downsideValues.length > 0
      ? downsideValues.reduce((sum, value) => sum + value ** 2, 0) / downsideValues.length
      : 0;
  const downsideDeviation = Math.sqrt(downsideVariance);
  const positiveDays = dayRows.filter((row) => row.pnl > 0).length;
  const positiveWeeks = weekRows.filter((row) => row.pnl > 0).length;
  const positiveMonths = monthRows.filter((row) => row.pnl > 0).length;
  const sharpe = stdDev > 0 ? mean / stdDev : 0;
  const sortino = downsideDeviation > 0 ? mean / downsideDeviation : 0;
  const coverageSpanDays = resolveCoverageSpanDays(trades, range);
  const daySpan = coverageSpanDays ?? (dayRows.length > 0 ? dayRows.length : 0);
  const weekSpan = daySpan > 0 ? daySpan / 7 : 0;
  const monthSpan = daySpan > 0 ? daySpan / AVG_DAYS_PER_MONTH : 0;

  return {
    tradeCount,
    netPnl,
    totalPnl: netPnl,
    winRate: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
    profitFactor:
      grossLosses === 0 ? (grossWins > 0 ? grossWins : 0) : grossWins / Math.abs(grossLosses),
    avgPnl,
    avgHoldMinutes: tradeCount > 0 ? totalHoldMinutes / tradeCount : 0,
    avgWinDurationMin: wins > 0 ? totalWinHoldMinutes / wins : 0,
    avgLossDurationMin: losses > 0 ? totalLossHoldMinutes / losses : 0,
    avgR: tradeCount > 0 ? totalR / tradeCount : 0,
    avgWin,
    avgLoss,
    averageConfidence: tradeCount > 0 ? totalConfidence / tradeCount : 0,
    tradesPerDay: daySpan > 0 ? tradeCount / daySpan : 0,
    tradesPerWeek: weekSpan > 0 ? tradeCount / weekSpan : 0,
    tradesPerMonth: monthSpan > 0 ? tradeCount / monthSpan : 0,
    consistencyPerDay: dayRows.length > 0 ? (positiveDays / dayRows.length) * 100 : 0,
    consistencyPerWeek: weekRows.length > 0 ? (positiveWeeks / weekRows.length) * 100 : 0,
    consistencyPerMonth: monthRows.length > 0 ? (positiveMonths / monthRows.length) * 100 : 0,
    consistencyPerTrade: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
    avgPnlPerDay: daySpan > 0 ? netPnl / daySpan : 0,
    avgPnlPerWeek: weekSpan > 0 ? netPnl / weekSpan : 0,
    avgPnlPerMonth: monthSpan > 0 ? netPnl / monthSpan : 0,
    avgPeakPerTrade: tradeCount > 0 ? estimatedPeakTotal / tradeCount : 0,
    avgMaxDrawdownPerTrade: tradeCount > 0 ? estimatedDrawdownTotal / tradeCount : 0,
    avgTimeInProfitMin: tradeCount > 0 ? estimatedProfitMinutes / tradeCount : 0,
    avgTimeInDeficitMin: tradeCount > 0 ? estimatedDeficitMinutes / tradeCount : 0,
    sharpe,
    sortino,
    wins,
    losses,
    grossWins,
    grossLosses,
    maxWin,
    maxLoss,
    maxDrawdown,
    bestDay,
    worstDay
  };
};
