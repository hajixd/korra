import { NextResponse } from "next/server";
import {
  getTradeDayKey,
  getTradeMonthKey,
  getTradeWeekKey,
  summarizeBacktestTrades
} from "../../../../lib/backtestStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HistoryItem = {
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

type MainStatsBucketRow = {
  label: string;
  total: number;
  trades: number;
};

type MainStatsMonthRow = {
  key: string;
  total: number;
  trades: number;
  months: number;
  avgPerTrade: number;
};

type BacktestClusterGroupId = "momentum" | "trend" | "trap" | "chop";

type BacktestClusterNode = {
  id: string;
  trade: HistoryItem;
  clusterId: BacktestClusterGroupId;
  x: number;
  y: number;
  r: number;
  tone: "up" | "down";
  holdMinutes: number;
  confidence: number;
  session: string;
  monthIndex: number;
  weekdayIndex: number;
  hour: number;
  sideLabel: "Buy" | "Sell";
};

type BacktestClusterGroup = {
  id: BacktestClusterGroupId;
  label: string;
  description: string;
  count: number;
  wins: number;
  losses: number;
  buyCount: number;
  sellCount: number;
  pnl: number;
  maxWin: number;
  maxLoss: number;
  avgPnl: number;
  avgHoldMinutes: number;
  avgConfidence: number;
  winRate: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  accent: string;
  fill: string;
  border: string;
  glow: string;
  members: string[];
};

type BacktestSummaryStats = {
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

type TemporalChartRow = {
  bucket: string;
  pnl: number;
  count: number;
};

type PerformanceStatsTemporalCharts = {
  hours: TemporalChartRow[];
  weekday: TemporalChartRow[];
  month: TemporalChartRow[];
  year: TemporalChartRow[];
  hasData: boolean;
};

type CalendarActivityEntry = {
  count: number;
  wins: number;
  pnl: number;
};

type BacktestAnalyticsResponseBody = {
  backtestSummary: BacktestSummaryStats;
  baselineMainStatsSummary: BacktestSummaryStats;
  mainStatsSummary: BacktestSummaryStats;
  mainStatsSessionRows: MainStatsBucketRow[];
  mainStatsModelRows: MainStatsBucketRow[];
  mainStatsMonthRows: MainStatsMonthRow[];
  mainStatsAiEfficiency: number | null;
  mainStatsAiEffectivenessPct: number | null;
  mainStatsAiEfficacyPct: number | null;
  availableBacktestMonths: string[];
  calendarActivityEntries: Array<[string, CalendarActivityEntry]>;
  selectedBacktestDayTrades: HistoryItem[];
  performanceStatsModelOptions: string[];
  performanceStatsTemporalCharts: PerformanceStatsTemporalCharts;
  entryExitStats: {
    entry: Array<[string, number]>;
    exit: Array<[string, number]>;
  };
  entryExitChartData: {
    entry: Array<{ bucket: string; count: number; share: number }>;
    exit: Array<{ bucket: string; count: number; share: number }>;
  };
  backtestClusterData: {
    total: number;
    nodes: BacktestClusterNode[];
    groups: BacktestClusterGroup[];
  };
  backtestClusterViewOptions: {
    sessions: string[];
    months: number[];
    weekdays: number[];
    hours: number[];
  };
};

const backtestWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const backtestSessionLabels = ["Tokyo", "London", "New York", "Sydney"] as const;
const backtestMonthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;
const backtestHourLabels = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`
);

const BACKTEST_CLUSTER_META: Record<
  BacktestClusterGroupId,
  {
    label: string;
    description: string;
    accent: string;
    fill: string;
    border: string;
    glow: string;
  }
> = {
  momentum: {
    label: "Momentum",
    description: "Fast winners that resolve quickly with clean follow-through.",
    accent: "rgba(60, 220, 120, 0.96)",
    fill: "rgba(60, 220, 120, 0.14)",
    border: "rgba(60, 220, 120, 0.46)",
    glow: "rgba(60, 220, 120, 0.24)"
  },
  trend: {
    label: "Trend Hold",
    description: "Winners that need more time but keep directional conviction.",
    accent: "rgba(0, 210, 255, 0.96)",
    fill: "rgba(0, 210, 255, 0.14)",
    border: "rgba(0, 210, 255, 0.46)",
    glow: "rgba(0, 210, 255, 0.24)"
  },
  trap: {
    label: "Trap",
    description: "Losses that extend before the move fully invalidates.",
    accent: "rgba(230, 80, 80, 0.96)",
    fill: "rgba(230, 80, 80, 0.14)",
    border: "rgba(230, 80, 80, 0.46)",
    glow: "rgba(230, 80, 80, 0.24)"
  },
  chop: {
    label: "Chop",
    description: "Short-lived noise trades with shallow edge.",
    accent: "rgba(255, 140, 0, 0.96)",
    fill: "rgba(255, 140, 0, 0.14)",
    border: "rgba(255, 140, 0, 0.46)",
    glow: "rgba(255, 140, 0, 0.24)"
  }
};

const BACKTEST_CLUSTER_ORDER: BacktestClusterGroupId[] = [
  "momentum",
  "trend",
  "trap",
  "chop"
];

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const toNumeric = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hashSeedFromText = (seedText: string): number => {
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 33 + seedText.charCodeAt(i)) >>> 0;
  }
  return seed;
};

const getTradeMonthIndex = (timestampSeconds: number): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCMonth();
};

const getTradeCalendarMonthKey = (timestampSeconds: number): string => {
  return String(getTradeMonthIndex(timestampSeconds) + 1).padStart(2, "0");
};

const getTradeHour = (timestampSeconds: number): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCHours();
};

const getSessionLabel = (timestampSeconds: number): string => {
  const date = new Date(Number(timestampSeconds) * 1000);

  if (Number.isNaN(date.getTime())) {
    return "Sydney";
  }

  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;

  if (hour >= 16 || hour < 1) {
    return "Tokyo";
  }

  if (hour >= 12 && hour < 21) {
    return "Sydney";
  }

  if (hour >= 0 && hour < 9) {
    return "London";
  }

  if (hour >= 5 && hour < 14) {
    return "New York";
  }

  return "London";
};

const getTradeConfidenceScore = (trade: HistoryItem): number => {
  const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
  const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
  const rrScore = clamp(rewardDistance / riskDistance / 3, 0, 1) * 0.2;
  const pnlScore = clamp(Math.abs(trade.pnlPct) / 0.45, 0, 1) * 0.18;
  const durationMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
  const durationScore = clamp(1 - durationMinutes / 720, 0, 1) * 0.08;
  const base = trade.result === "Win" ? 0.44 : 0.26;
  const sideBias = trade.side === "Long" ? 0.04 : 0.02;

  return clamp(base + rrScore + pnlScore + durationScore + sideBias, 0.05, 0.96);
};

const getTradeEntryLabel = (trade: Pick<HistoryItem, "entrySource">): string => {
  const raw = String(trade.entrySource ?? "").trim();
  return raw || "Settings";
};

const normalizeBacktestExitReason = (reason?: string | null): string => {
  const raw = String(reason ?? "").trim();
  if (!raw) {
    return "";
  }

  const upper = raw.toUpperCase();

  if (upper === "TP" || upper.includes("TAKE")) {
    return "Take Profit";
  }

  if (
    upper === "BE" ||
    upper === "BREAKEVEN" ||
    upper === "BREAK-EVEN" ||
    upper.includes("BREAK EVEN")
  ) {
    return "Break Even";
  }

  if (upper === "TSL" || upper.includes("TRAIL")) {
    return "Trailing Stop";
  }

  if (upper === "SL" || upper.includes("STOP")) {
    return "Stop Loss";
  }

  if (upper.includes("MIM") || upper.includes("MIT")) {
    return "MIT";
  }

  if (upper.includes("AI")) {
    return "AI";
  }

  if (upper.includes("MODEL")) {
    return "Model Exit";
  }

  return raw;
};

const getTradeExitLabel = (
  trade: Pick<
    HistoryItem,
    "exitReason" | "result" | "targetPrice" | "stopPrice" | "entryPrice" | "outcomePrice"
  >
): string => {
  const normalized = normalizeBacktestExitReason(trade.exitReason);

  if (normalized) {
    return normalized;
  }

  const targetGap = Math.abs(trade.targetPrice - trade.entryPrice);
  const stopGap = Math.abs(trade.entryPrice - trade.stopPrice);
  const realizedGap = Math.abs(trade.outcomePrice - trade.entryPrice);

  if (trade.result === "Win" && realizedGap >= targetGap * 0.84) {
    return "Take Profit";
  }

  if (trade.result === "Loss" && realizedGap >= stopGap * 0.84) {
    return "Stop Loss";
  }

  return "Model Exit";
};

const normalizeTrade = (value: unknown): HistoryItem | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();

  if (!id) {
    return null;
  }

  const side = row.side === "Short" ? "Short" : "Long";
  const result = row.result === "Loss" ? "Loss" : "Win";

  return {
    id,
    symbol: String(row.symbol ?? ""),
    side,
    result,
    entrySource: String(row.entrySource ?? "Settings"),
    exitReason: String(row.exitReason ?? ""),
    pnlPct: toNumeric(row.pnlPct),
    pnlUsd: toNumeric(row.pnlUsd),
    time: String(row.time ?? ""),
    entryAt: String(row.entryAt ?? ""),
    exitAt: String(row.exitAt ?? ""),
    entryTime: toNumeric(row.entryTime),
    exitTime: toNumeric(row.exitTime),
    entryPrice: Math.max(0.000001, toNumeric(row.entryPrice)),
    targetPrice: Math.max(0.000001, toNumeric(row.targetPrice)),
    stopPrice: Math.max(0.000001, toNumeric(row.stopPrice)),
    outcomePrice: Math.max(0.000001, toNumeric(row.outcomePrice)),
    units: Math.max(0.000001, Math.abs(toNumeric(row.units, 1)) || 1)
  };
};

const normalizeTrades = (value: unknown): HistoryItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: HistoryItem[] = [];
  for (const item of value) {
    const normalized = normalizeTrade(item);
    if (normalized) {
      out.push(normalized);
    }
  }
  return out;
};

const normalizeConfidenceById = (value: unknown): Map<string, number> => {
  const map = new Map<string, number>();
  if (!Array.isArray(value)) {
    return map;
  }

  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }
    const key = String(entry[0] ?? "").trim();
    if (!key) {
      continue;
    }
    map.set(key, toNumeric(entry[1], 0));
  }

  return map;
};

const emptyBacktestSummary = (): BacktestSummaryStats => ({
  tradeCount: 0,
  netPnl: 0,
  totalPnl: 0,
  winRate: 0,
  profitFactor: 0,
  avgPnl: 0,
  avgHoldMinutes: 0,
  avgWinDurationMin: 0,
  avgLossDurationMin: 0,
  avgR: 0,
  avgWin: 0,
  avgLoss: 0,
  averageConfidence: 0,
  tradesPerDay: 0,
  tradesPerWeek: 0,
  tradesPerMonth: 0,
  consistencyPerDay: 0,
  consistencyPerWeek: 0,
  consistencyPerMonth: 0,
  consistencyPerTrade: 0,
  avgPnlPerDay: 0,
  avgPnlPerWeek: 0,
  avgPnlPerMonth: 0,
  avgPeakPerTrade: 0,
  avgMaxDrawdownPerTrade: 0,
  avgTimeInProfitMin: 0,
  avgTimeInDeficitMin: 0,
  sharpe: 0,
  sortino: 0,
  wins: 0,
  losses: 0,
  grossWins: 0,
  grossLosses: 0,
  maxWin: 0,
  maxLoss: 0,
  maxDrawdown: 0,
  bestDay: null,
  worstDay: null
});

const buildBacktestClusterGroups = (nodes: BacktestClusterNode[]): BacktestClusterGroup[] => {
  const groupMap = new Map<
    BacktestClusterGroupId,
    {
      count: number;
      wins: number;
      buyCount: number;
      sellCount: number;
      pnl: number;
      maxWin: number;
      maxLoss: number;
      totalHoldMinutes: number;
      totalConfidence: number;
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      members: string[];
    }
  >();

  for (const node of nodes) {
    const current =
      groupMap.get(node.clusterId) ??
      (() => {
        const next = {
          count: 0,
          wins: 0,
          buyCount: 0,
          sellCount: 0,
          pnl: 0,
          maxWin: Number.NEGATIVE_INFINITY,
          maxLoss: Number.POSITIVE_INFINITY,
          totalHoldMinutes: 0,
          totalConfidence: 0,
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
          maxY: Number.NEGATIVE_INFINITY,
          members: [] as string[]
        };
        groupMap.set(node.clusterId, next);
        return next;
      })();

    current.count += 1;
    current.wins += node.trade.result === "Win" ? 1 : 0;
    current.buyCount += node.trade.side === "Long" ? 1 : 0;
    current.sellCount += node.trade.side === "Short" ? 1 : 0;
    current.pnl += node.trade.pnlUsd;
    current.maxWin = Math.max(current.maxWin, node.trade.pnlUsd);
    current.maxLoss = Math.min(current.maxLoss, node.trade.pnlUsd);
    current.totalHoldMinutes += node.holdMinutes;
    current.totalConfidence += node.confidence;
    current.minX = Math.min(current.minX, node.x);
    current.maxX = Math.max(current.maxX, node.x);
    current.minY = Math.min(current.minY, node.y);
    current.maxY = Math.max(current.maxY, node.y);
    current.members.push(node.id);
  }

  return BACKTEST_CLUSTER_ORDER.flatMap((groupId) => {
    const current = groupMap.get(groupId);

    if (!current) {
      return [];
    }

    const meta = BACKTEST_CLUSTER_META[groupId];
    const losses = Math.max(0, current.count - current.wins);
    const centerX = (current.minX + current.maxX) / 2;
    const centerY = (current.minY + current.maxY) / 2;

    return [
      {
        id: groupId,
        label: meta.label,
        description: meta.description,
        count: current.count,
        wins: current.wins,
        losses,
        buyCount: current.buyCount,
        sellCount: current.sellCount,
        pnl: current.pnl,
        maxWin: Number.isFinite(current.maxWin) ? current.maxWin : 0,
        maxLoss: Number.isFinite(current.maxLoss) ? current.maxLoss : 0,
        avgPnl: current.count > 0 ? current.pnl / current.count : 0,
        avgHoldMinutes: current.count > 0 ? current.totalHoldMinutes / current.count : 0,
        avgConfidence: current.count > 0 ? current.totalConfidence / current.count : 0,
        winRate: current.count > 0 ? (current.wins / current.count) * 100 : 0,
        centerX,
        centerY,
        radiusX: clamp((current.maxX - current.minX) * 0.5 + 6, 10, 23),
        radiusY: clamp((current.maxY - current.minY) * 0.5 + 6, 10, 23),
        accent: meta.accent,
        fill: meta.fill,
        border: meta.border,
        glow: meta.glow,
        members: [...current.members]
      }
    ];
  });
};

const computeMainStatsSessionRows = (trades: HistoryItem[]): MainStatsBucketRow[] => {
  const map = new Map<string, MainStatsBucketRow>();

  for (const trade of trades) {
    const label = getSessionLabel(trade.entryTime);
    const current = map.get(label) ?? { label, total: 0, trades: 0 };
    current.total += trade.pnlUsd;
    current.trades += 1;
    map.set(label, current);
  }

  return Array.from(map.values()).sort((left, right) => {
    const leftIndex = backtestSessionLabels.indexOf(left.label as (typeof backtestSessionLabels)[number]);
    const rightIndex = backtestSessionLabels.indexOf(
      right.label as (typeof backtestSessionLabels)[number]
    );

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) {
        return 1;
      }

      if (rightIndex === -1) {
        return -1;
      }

      return leftIndex - rightIndex;
    }

    return left.label.localeCompare(right.label);
  });
};

const computeMainStatsModelRows = (trades: HistoryItem[]): MainStatsBucketRow[] => {
  const map = new Map<string, MainStatsBucketRow>();

  for (const trade of trades) {
    const label = getTradeEntryLabel(trade);
    const current = map.get(label) ?? { label, total: 0, trades: 0 };
    current.total += trade.pnlUsd;
    current.trades += 1;
    map.set(label, current);
  }

  return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
};

const computeMainStatsMonthRows = (trades: HistoryItem[]): MainStatsMonthRow[] => {
  const monthBuckets = new Map<string, { key: string; pnl: number; trades: number }>();

  for (const trade of trades) {
    const key = getTradeMonthKey(trade.exitTime);
    const monthKey = getTradeCalendarMonthKey(trade.exitTime);
    const current = monthBuckets.get(key) ?? { key: monthKey, pnl: 0, trades: 0 };
    current.pnl += trade.pnlUsd;
    current.trades += 1;
    monthBuckets.set(key, current);
  }

  const map = new Map<
    string,
    { key: string; total: number; trades: number; months: number; avgPerTrade: number }
  >();

  for (const bucket of monthBuckets.values()) {
    const current = map.get(bucket.key) ?? {
      key: bucket.key,
      total: 0,
      trades: 0,
      months: 0,
      avgPerTrade: 0
    };
    current.total += bucket.pnl;
    current.trades += bucket.trades;
    current.months += 1;
    map.set(bucket.key, current);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      avgPerTrade: row.trades > 0 ? row.total / row.trades : 0,
      total: row.months > 0 ? row.total / row.months : 0
    }))
    .sort((left, right) => Number(left.key) - Number(right.key));
};

const computeMainStatsAiEfficiency = (
  trades: HistoryItem[],
  aiMode: "off" | "knn" | "hdbscan",
  confidenceResolver: (trade: HistoryItem) => number
): number | null => {
  if (aiMode === "off" || trades.length < 10) {
    return null;
  }

  const points = trades.map((trade) => ({
    score: confidenceResolver(trade),
    outcome: trade.pnlUsd >= 0 ? 1 : 0
  }));
  const positives = points.filter((point) => point.outcome === 1).length;
  const negatives = points.length - positives;

  if (positives < 2 || negatives < 2) {
    return null;
  }

  points.sort((left, right) => left.score - right.score);

  let positiveRankTotal = 0;
  let index = 0;

  while (index < points.length) {
    let nextIndex = index + 1;

    while (nextIndex < points.length && points[nextIndex]?.score === points[index]?.score) {
      nextIndex += 1;
    }

    const averageRank = (index + 1 + nextIndex) / 2;

    for (let offset = index; offset < nextIndex; offset += 1) {
      if (points[offset]?.outcome === 1) {
        positiveRankTotal += averageRank;
      }
    }

    index = nextIndex;
  }

  const auc =
    (positiveRankTotal - (positives * (positives + 1)) / 2) /
    (Math.max(1, positives) * Math.max(1, negatives));

  return clamp(auc, 0, 1);
};

const computePerformanceStatsTemporalCharts = (
  trades: HistoryItem[],
  performanceStatsModel: string,
  enabled: boolean
): { modelOptions: string[]; charts: PerformanceStatsTemporalCharts } => {
  if (!enabled) {
    return {
      modelOptions: ["All"],
      charts: {
        hours: [],
        weekday: [],
        month: [],
        year: [],
        hasData: false
      }
    };
  }

  const models = Array.from(
    new Set(
      trades
        .map((trade) => getTradeEntryLabel(trade))
        .filter((name) => name.length > 0)
    )
  );

  const modelOptions = ["All", ...models];

  const modelTrades = trades.filter((trade) => {
    const modelName = getTradeEntryLabel(trade);

    if (performanceStatsModel === "All") {
      return true;
    }

    return modelName === performanceStatsModel;
  });

  const buildSeries = (range: "hours" | "weekday" | "month" | "year") => {
    const buckets = new Map<string, { pnl: number; count: number }>();

    for (const trade of modelTrades) {
      const timestampSeconds = Number(trade.entryTime ?? trade.exitTime);

      if (!Number.isFinite(timestampSeconds)) {
        continue;
      }

      const date = new Date(timestampSeconds * 1000);
      let key = "";

      if (range === "hours") {
        key = backtestHourLabels[date.getUTCHours()] ?? String(date.getUTCHours());
      } else if (range === "weekday") {
        key = backtestWeekdayLabels[date.getUTCDay()] ?? String(date.getUTCDay());
      } else if (range === "month") {
        key = backtestMonthLabels[date.getUTCMonth()] ?? String(date.getUTCMonth() + 1);
      } else {
        key = String(date.getUTCFullYear());
      }

      const current = buckets.get(key) ?? { pnl: 0, count: 0 };
      buckets.set(key, {
        pnl: current.pnl + trade.pnlUsd,
        count: current.count + 1
      });
    }

    let orderedBuckets: string[] = [];

    if (range === "hours") {
      orderedBuckets = [...backtestHourLabels];
    } else if (range === "weekday") {
      orderedBuckets = [...backtestWeekdayLabels];
    } else if (range === "month") {
      orderedBuckets = [...backtestMonthLabels];
    } else {
      orderedBuckets = Array.from(buckets.keys())
        .map((bucket) => Number(bucket))
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right)
        .map((value) => String(value));
    }

    return orderedBuckets.map((bucket) => {
      const record = buckets.get(bucket) ?? { pnl: 0, count: 0 };
      return {
        bucket,
        pnl: Number(record.pnl.toFixed(2)),
        count: record.count
      };
    });
  };

  const hours = buildSeries("hours");
  const weekday = buildSeries("weekday");
  const month = buildSeries("month");
  const year = buildSeries("year");
  const hasData = [hours, weekday, month, year].some((series) =>
    series.some((row) => row.count > 0)
  );

  return {
    modelOptions,
    charts: { hours, weekday, month, year, hasData }
  };
};

const computeBacktestClusterData = (
  trades: HistoryItem[],
  confidenceResolver: (trade: HistoryItem) => number,
  enabled: boolean
): {
  total: number;
  nodes: BacktestClusterNode[];
  groups: BacktestClusterGroup[];
  viewOptions: {
    sessions: string[];
    months: number[];
    weekdays: number[];
    hours: number[];
  };
} => {
  if (!enabled) {
    return {
      total: 0,
      nodes: [],
      groups: [],
      viewOptions: {
        sessions: [],
        months: [],
        weekdays: [],
        hours: []
      }
    };
  }

  const holds = trades.map((trade) =>
    Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60)
  );
  const sortedHolds = [...holds].sort((a, b) => a - b);
  const medianHold = sortedHolds.length > 0 ? sortedHolds[Math.floor(sortedHolds.length / 2)] ?? 0 : 0;
  const maxHold = holds.length > 0 ? Math.max(1, ...holds) : 1;
  const maxUnits = trades.length > 0 ? Math.max(1, ...trades.map((trade) => trade.units)) : 1;
  const maxAbsPnl =
    trades.length > 0 ? Math.max(1, ...trades.map((trade) => Math.abs(trade.pnlPct))) : 1;

  const nodes: BacktestClusterNode[] = trades.map((trade) => {
    const holdMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
    const clusterId: BacktestClusterGroupId =
      trade.result === "Win"
        ? holdMinutes <= medianHold
          ? "momentum"
          : "trend"
        : Math.abs(trade.pnlPct) >= 0.22
          ? "trap"
          : "chop";
    const seed = hashSeedFromText(`cluster-node-${trade.id}`);
    const jitterX = ((((seed >>> 3) & 255) / 255) * 2 - 1) * 5;
    const jitterY = ((((seed >>> 11) & 255) / 255) * 2 - 1) * 5;
    const baseX = 14 + ((trade.pnlPct + maxAbsPnl) / (maxAbsPnl * 2)) * 72;
    const baseY = 86 - (holdMinutes / maxHold) * 66;

    return {
      id: trade.id,
      trade,
      clusterId,
      x: clamp(baseX + jitterX, 8, 92),
      y: clamp(baseY + jitterY, 10, 90),
      r: 2.8 + (trade.units / maxUnits) * 3.8,
      tone: trade.pnlUsd >= 0 ? "up" : "down",
      holdMinutes,
      confidence: confidenceResolver(trade) * 100,
      session: getSessionLabel(trade.entryTime),
      monthIndex: getTradeMonthIndex(trade.entryTime),
      weekdayIndex: new Date(Number(trade.entryTime) * 1000).getUTCDay(),
      hour: getTradeHour(trade.entryTime),
      sideLabel: trade.side === "Long" ? "Buy" : "Sell"
    };
  });

  const sessions = new Set<string>();
  const months = new Set<number>();
  const weekdays = new Set<number>();
  const hours = new Set<number>();

  for (const node of nodes) {
    sessions.add(node.session);
    months.add(node.monthIndex);
    weekdays.add(node.weekdayIndex);
    hours.add(node.hour);
  }

  return {
    total: trades.length,
    nodes,
    groups: buildBacktestClusterGroups(nodes),
    viewOptions: {
      sessions: backtestSessionLabels.filter((label) => sessions.has(label)),
      months: Array.from(months).sort((a, b) => a - b),
      weekdays: Array.from(weekdays).sort((a, b) => a - b),
      hours: Array.from(hours).sort((a, b) => a - b)
    }
  };
};

const computeEntryExitStats = (
  trades: HistoryItem[],
  enabled: boolean
): { entry: Array<[string, number]>; exit: Array<[string, number]> } => {
  if (!enabled) {
    return {
      entry: [],
      exit: []
    };
  }

  const entryCounts: Record<string, number> = {};
  const exitCounts: Record<string, number> = {};

  for (const trade of trades) {
    const entryKey = getTradeEntryLabel(trade);
    const exitKey = getTradeExitLabel(trade);
    entryCounts[entryKey] = (entryCounts[entryKey] ?? 0) + 1;
    exitCounts[exitKey] = (exitCounts[exitKey] ?? 0) + 1;
  }

  const toSorted = (counts: Record<string, number>) => {
    return Object.entries(counts).sort((left, right) => right[1] - left[1]);
  };

  return {
    entry: toSorted(entryCounts),
    exit: toSorted(exitCounts)
  };
};

const computeEntryExitChartData = (entryExitStats: {
  entry: Array<[string, number]>;
  exit: Array<[string, number]>;
}) => {
  const toRows = (source: Array<[string, number]>) => {
    const total = source.reduce((sum, [, count]) => sum + count, 0);
    return source.map(([bucket, count]) => ({
      bucket,
      count,
      share: total > 0 ? (count / total) * 100 : 0
    }));
  };

  return {
    entry: toRows(entryExitStats.entry),
    exit: toRows(entryExitStats.exit)
  };
};

const buildCalendarData = (
  trades: HistoryItem[],
  selectedBacktestDateKey: string,
  enabled: boolean
): {
  availableBacktestMonths: string[];
  calendarActivityEntries: Array<[string, CalendarActivityEntry]>;
  selectedBacktestDayTrades: HistoryItem[];
} => {
  if (!enabled) {
    return {
      availableBacktestMonths: [],
      calendarActivityEntries: [],
      selectedBacktestDayTrades: []
    };
  }

  const monthKeys = new Set<string>();
  const map = new Map<string, CalendarActivityEntry & { items: HistoryItem[] }>();

  for (const trade of trades) {
    monthKeys.add(getTradeMonthKey(trade.exitTime));
    const dateKey = getTradeDayKey(trade.exitTime);
    const bucket = map.get(dateKey) ?? { count: 0, wins: 0, pnl: 0, items: [] };
    bucket.count += 1;
    bucket.wins += trade.result === "Win" ? 1 : 0;
    bucket.pnl += trade.pnlUsd;
    bucket.items.push(trade);
    map.set(dateKey, bucket);
  }

  const selected =
    map.get(selectedBacktestDateKey)?.items
      ?.slice()
      .sort((a, b) => Number(b.exitTime) - Number(a.exitTime)) ?? [];

  return {
    availableBacktestMonths: Array.from(monthKeys).sort((a, b) => b.localeCompare(a)),
    calendarActivityEntries: Array.from(map.entries()).map(([key, value]) => [
      key,
      {
        count: value.count,
        wins: value.wins,
        pnl: value.pnl
      }
    ]),
    selectedBacktestDayTrades: selected
  };
};

const emptyResponse = (): BacktestAnalyticsResponseBody => ({
  backtestSummary: emptyBacktestSummary(),
  baselineMainStatsSummary: emptyBacktestSummary(),
  mainStatsSummary: emptyBacktestSummary(),
  mainStatsSessionRows: [],
  mainStatsModelRows: [],
  mainStatsMonthRows: [],
  mainStatsAiEfficiency: null,
  mainStatsAiEffectivenessPct: null,
  mainStatsAiEfficacyPct: null,
  availableBacktestMonths: [],
  calendarActivityEntries: [],
  selectedBacktestDayTrades: [],
  performanceStatsModelOptions: ["All"],
  performanceStatsTemporalCharts: {
    hours: [],
    weekday: [],
    month: [],
    year: [],
    hasData: false
  },
  entryExitStats: {
    entry: [],
    exit: []
  },
  entryExitChartData: {
    entry: [],
    exit: []
  },
  backtestClusterData: {
    total: 0,
    nodes: [],
    groups: []
  },
  backtestClusterViewOptions: {
    sessions: [],
    months: [],
    weekdays: [],
    hours: []
  }
});

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const body =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : null;

  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const backtestTrades = normalizeTrades(body.backtestTrades);
  const baselineMainStatsTrades = normalizeTrades(body.baselineMainStatsTrades);
  const confidenceById = normalizeConfidenceById(body.confidenceByIdEntries);
  const aiMode =
    body.aiMode === "knn" || body.aiMode === "hdbscan"
      ? body.aiMode
      : "off";
  const confidenceGateDisabled = body.confidenceGateDisabled === true;
  const selectedBacktestDateKey = String(body.selectedBacktestDateKey ?? "");
  const statsDateStart = typeof body.statsDateStart === "string" ? body.statsDateStart : "";
  const statsDateEnd = typeof body.statsDateEnd === "string" ? body.statsDateEnd : "";
  const performanceStatsModel = String(body.performanceStatsModel ?? "All");
  const isCalendarBacktestTabActive = body.isCalendarBacktestTabActive === true;
  const isPerformanceStatsBacktestTabActive = body.isPerformanceStatsBacktestTabActive === true;
  const isEntryExitBacktestTabActive = body.isEntryExitBacktestTabActive === true;
  const isClusterBacktestTabActive = body.isClusterBacktestTabActive === true;

  const resolveConfidenceScore = (trade: HistoryItem) => {
    return confidenceById.get(trade.id) ?? getTradeConfidenceScore(trade);
  };

  const summaryRange = {
    startYmd: statsDateStart,
    endYmd: statsDateEnd
  };

  const backtestSummary = summarizeBacktestTrades(
    backtestTrades,
    resolveConfidenceScore,
    summaryRange
  );
  const baselineMainStatsSummary = summarizeBacktestTrades(
    baselineMainStatsTrades,
    resolveConfidenceScore,
    summaryRange
  );
  const mainStatsSummary = summarizeBacktestTrades(
    backtestTrades,
    resolveConfidenceScore,
    summaryRange
  );

  const mainStatsSessionRows = computeMainStatsSessionRows(backtestTrades);
  const mainStatsModelRows = computeMainStatsModelRows(backtestTrades);
  const mainStatsMonthRows = computeMainStatsMonthRows(backtestTrades);

  const mainStatsAiEfficiency = computeMainStatsAiEfficiency(
    backtestTrades,
    aiMode,
    resolveConfidenceScore
  );

  const mainStatsAiEffectivenessPct =
    aiMode === "off" ||
    confidenceGateDisabled ||
    baselineMainStatsTrades.length < 5 ||
    backtestTrades.length < 5
      ? null
      : mainStatsSummary.winRate - baselineMainStatsSummary.winRate;

  const mainStatsAiEfficacyPct = (() => {
    if (
      aiMode === "off" ||
      confidenceGateDisabled ||
      baselineMainStatsTrades.length < 5 ||
      backtestTrades.length < 5
    ) {
      return null;
    }

    const baselinePnl = baselineMainStatsSummary.totalPnl;
    const currentPnl = mainStatsSummary.totalPnl;
    const denominator =
      Math.abs(baselinePnl) > 0.000000001
        ? Math.abs(baselinePnl)
        : Math.max(0.000000001, Math.abs(currentPnl));

    return ((currentPnl - baselinePnl) / denominator) * 100;
  })();

  const calendarData = buildCalendarData(
    backtestTrades,
    selectedBacktestDateKey,
    isCalendarBacktestTabActive
  );

  const performanceStats = computePerformanceStatsTemporalCharts(
    backtestTrades,
    performanceStatsModel,
    isPerformanceStatsBacktestTabActive
  );
  const entryExitStats = computeEntryExitStats(backtestTrades, isEntryExitBacktestTabActive);
  const entryExitChartData = computeEntryExitChartData(entryExitStats);

  const clusterData = computeBacktestClusterData(
    backtestTrades,
    resolveConfidenceScore,
    isClusterBacktestTabActive
  );

  const payload: BacktestAnalyticsResponseBody = {
    ...emptyResponse(),
    backtestSummary,
    baselineMainStatsSummary,
    mainStatsSummary,
    mainStatsSessionRows,
    mainStatsModelRows,
    mainStatsMonthRows,
    mainStatsAiEfficiency,
    mainStatsAiEffectivenessPct,
    mainStatsAiEfficacyPct,
    availableBacktestMonths: calendarData.availableBacktestMonths,
    calendarActivityEntries: calendarData.calendarActivityEntries,
    selectedBacktestDayTrades: calendarData.selectedBacktestDayTrades,
    performanceStatsModelOptions: performanceStats.modelOptions,
    performanceStatsTemporalCharts: performanceStats.charts,
    entryExitStats,
    entryExitChartData,
    backtestClusterData: {
      total: clusterData.total,
      nodes: clusterData.nodes,
      groups: clusterData.groups
    },
    backtestClusterViewOptions: clusterData.viewOptions
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
