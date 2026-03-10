import type { GideonRuntimeContext, GideonRuntimeTrade } from "../contracts";

const METRIC_HINTS: Array<{ metricId: string; patterns: RegExp[] }> = [
  {
    metricId: "profit_factor",
    patterns: [/\bprofit factor\b/i]
  },
  {
    metricId: "max_drawdown_usd",
    patterns: [/\bmax drawdown\b/i, /\bdrawdown\b/i, /\bunderwater\b/i]
  },
  {
    metricId: "expectancy_usd",
    patterns: [/\bexpectancy\b/i, /\bexpected value\b/i]
  },
  {
    metricId: "average_win_usd",
    patterns: [/\bavg(?:erage)? win\b/i]
  },
  {
    metricId: "average_loss_usd",
    patterns: [/\bavg(?:erage)? loss\b/i]
  },
  {
    metricId: "total_pnl_usd",
    patterns: [/\btotal pnl\b/i, /\bnet pnl\b/i, /\bnet profit\b/i, /\bpnl\b/i, /\bprofit\b/i]
  },
  {
    metricId: "win_rate",
    patterns: [/\bwin rate\b/i, /\bhit rate\b/i, /\baccuracy\b/i]
  },
  {
    metricId: "long_trades",
    patterns: [/\blong trades\b/i, /\blongs\b/i]
  },
  {
    metricId: "short_trades",
    patterns: [/\bshort trades\b/i, /\bshorts\b/i]
  },
  {
    metricId: "total_trades",
    patterns: [/\btotal trades\b/i, /\bhow many trades\b/i, /\btrade count\b/i, /\btrades\b/i]
  }
] as const;

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const toFiniteNumber = (value: number | null | undefined): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getTradeTimestamp = (row: GideonRuntimeTrade): number => {
  const exitTime = toFiniteNumber(row.exitTime ?? null);
  const entryTime = toFiniteNumber(row.entryTime ?? null);
  return exitTime || entryTime || 0;
};

const summarizeRows = (rows: GideonRuntimeTrade[]) => {
  let wins = 0;
  let losses = 0;
  let breakevenTrades = 0;
  let totalPnlUsd = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  const longShort = { long: 0, short: 0 };
  const orderedRows = [...rows].sort((left, right) => getTradeTimestamp(left) - getTradeTimestamp(right));
  let runningEquityUsd = 0;
  let peakEquityUsd = 0;
  let maxDrawdownUsd = 0;

  for (const row of orderedRows) {
    const result = String(row.result || "").toLowerCase();
    const pnlUsd = toFiniteNumber(row.pnlUsd ?? null);

    if (result === "win" || pnlUsd > 0) wins += 1;
    else if (result === "loss" || pnlUsd < 0) losses += 1;
    else breakevenTrades += 1;

    totalPnlUsd += pnlUsd;
    if (pnlUsd > 0) {
      grossProfitUsd += pnlUsd;
    } else if (pnlUsd < 0) {
      grossLossUsd += Math.abs(pnlUsd);
    }

    const side = String(row.side || "").toLowerCase();
    if (side === "long") longShort.long += 1;
    if (side === "short") longShort.short += 1;

    runningEquityUsd += pnlUsd;
    peakEquityUsd = Math.max(peakEquityUsd, runningEquityUsd);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peakEquityUsd - runningEquityUsd);
  }

  const totalTrades = orderedRows.length;
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const expectancyUsd = totalTrades > 0 ? totalPnlUsd / totalTrades : 0;
  const averageWinUsd = wins > 0 ? grossProfitUsd / wins : 0;
  const averageLossUsd = losses > 0 ? grossLossUsd / losses : 0;
  const profitFactor = grossLossUsd > 0 ? grossProfitUsd / grossLossUsd : null;

  return {
    totalTrades,
    wins,
    losses,
    breakevenTrades,
    winRatePct: round(winRatePct),
    totalPnlUsd: round(totalPnlUsd),
    grossProfitUsd: round(grossProfitUsd),
    grossLossUsd: round(grossLossUsd),
    averageWinUsd: round(averageWinUsd),
    averageLossUsd: round(averageLossUsd),
    expectancyUsd: round(expectancyUsd),
    profitFactor: profitFactor === null ? null : round(profitFactor, 3),
    maxDrawdownUsd: round(maxDrawdownUsd),
    longTrades: longShort.long,
    shortTrades: longShort.short
  };
};

const pickPreferredSummary = (runtime: GideonRuntimeContext) => {
  const backtest = summarizeRows(runtime.backtestRows);
  if (backtest.totalTrades > 0) {
    return {
      source: "backtest" as const,
      summary: backtest
    };
  }

  return {
    source: "history" as const,
    summary: summarizeRows(runtime.historyRows)
  };
};

export const summarizeTradeHistoryTool = (runtime: GideonRuntimeContext) => {
  return {
    source: "history",
    ...summarizeRows(runtime.historyRows)
  };
};

export const summarizeBacktestResultsTool = (runtime: GideonRuntimeContext) => {
  return {
    source: "backtest",
    ...summarizeRows(runtime.backtestRows)
  };
};

export const computeMetricTool = (params: {
  runtime: GideonRuntimeContext;
  metricId: string;
}) => {
  const { source, summary } = pickPreferredSummary(params.runtime);
  const metricId = params.metricId.trim().toLowerCase();

  const byMetric: Record<string, number | null> = {
    win_rate: summary.winRatePct,
    total_pnl_usd: summary.totalPnlUsd,
    total_trades: summary.totalTrades,
    long_trades: summary.longTrades,
    short_trades: summary.shortTrades,
    profit_factor: summary.profitFactor,
    expectancy_usd: summary.expectancyUsd,
    average_win_usd: summary.averageWinUsd,
    average_loss_usd: summary.averageLossUsd,
    max_drawdown_usd: summary.maxDrawdownUsd
  };

  return {
    source,
    metricId,
    value: byMetric[metricId] ?? null,
    totalTrades: summary.totalTrades
  };
};

export const inferMetricIdFromPrompt = (prompt: string): string | null => {
  const normalized = prompt.trim();
  if (!normalized) {
    return null;
  }

  for (const hint of METRIC_HINTS) {
    for (const pattern of hint.patterns) {
      if (pattern.test(normalized)) {
        return hint.metricId;
      }
    }
  }

  return null;
};
