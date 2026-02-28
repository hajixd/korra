"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";
type SurfaceTab = "chart" | "backtest";
type BacktestTab =
  | "mainStats"
  | "mainSettings"
  | "timeSettings"
  | "history"
  | "calendar"
  | "cluster"
  | "entryExit"
  | "dimensions"
  | "graphs"
  | "propFirm";
type EntryExitChartMode = "entry" | "exit";
type BacktestScatterKey = "pnlUsd" | "pnlPct" | "holdMinutes" | "units" | "confidence";
type PanelTab = "active" | "assets" | "models" | "mt5" | "history" | "actions" | "ai";

type FutureAsset = {
  symbol: string;
  name: string;
  basePrice: number;
  openInterest: string;
  funding: string;
};

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

const EMPTY_CANDLES: Candle[] = [];

type TradeResult = "Win" | "Loss";
type TradeSide = "Long" | "Short";

type HistoryItem = {
  id: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  pnlPct: number;
  pnlUsd: number;
  time: string;
  entryAt: string;
  exitAt: string;
  entryTime: UTCTimestamp;
  exitTime: UTCTimestamp;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
};

type ActionItem = {
  id: string;
  tradeId: string;
  symbol: string;
  label: string;
  details: string;
  time: string;
  timestamp: UTCTimestamp;
};

type NotificationTone = "up" | "down" | "neutral";

type NotificationItem = {
  id: string;
  title: string;
  details: string;
  time: string;
  timestamp: number;
  tone: NotificationTone;
  live?: boolean;
};

type ActiveTrade = {
  symbol: string;
  side: TradeSide;
  units: number;
  entryPrice: number;
  markPrice: number;
  targetPrice: number;
  stopPrice: number;
  openedAt: UTCTimestamp;
  openedAtLabel: string;
  elapsed: string;
  pnlPct: number;
  pnlValue: number;
  progressPct: number;
  rr: number;
};

type ModelProfile = {
  id: string;
  name: string;
  kind: "Person" | "Model";
  accountNumber?: string;
  riskMin: number;
  riskMax: number;
  rrMin: number;
  rrMax: number;
  longBias: number;
  winRate: number;
};

type TradingTerminalProps = {
  aiZipModelNames: string[];
};

type TradeBlueprint = {
  id: string;
  modelId: string;
  symbol: string;
  side: TradeSide;
  result: TradeResult;
  entryMs: number;
  exitMs: number;
  riskPct: number;
  rr: number;
  units: number;
};

type OverlayTrade = {
  id: string;
  symbol: string;
  side: TradeSide;
  status: "closed" | "pending";
  entryTime: UTCTimestamp;
  exitTime: UTCTimestamp;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  result: TradeResult;
  pnlUsd: number;
};

type MultiTradeOverlaySeries = {
  profitZone: ISeriesApi<"Baseline">;
  lossZone: ISeriesApi<"Baseline">;
  entryLine: ISeriesApi<"Line">;
  targetLine: ISeriesApi<"Line">;
  stopLine: ISeriesApi<"Line">;
  pathLine: ISeriesApi<"Line">;
};

type MarketApiCandle = {
  time: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
};

const hashSeedFromText = (seedText: string): number => {
  let seed = 0;

  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 33 + seedText.charCodeAt(i)) >>> 0;
  }

  return seed;
};

const createPseudoAccountNumber = (seedText: string): string => {
  const seed = hashSeedFromText(seedText);

  return String(10_000_000 + (seed % 90_000_000));
};

const createModelId = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "model";
};

const basePersonProfile: ModelProfile = {
  id: "korra",
  name: "Korra",
  kind: "Person",
  accountNumber: createPseudoAccountNumber("korra"),
  riskMin: 0.0018,
  riskMax: 0.0048,
  rrMin: 1.35,
  rrMax: 2.6,
  longBias: 0.57,
  winRate: 0.61
};

const createSyntheticModelProfile = (name: string): ModelProfile => {
  const seed = hashSeedFromText(name);
  const sample = (shift: number) => ((seed >>> shift) & 255) / 255;
  const riskMin = 0.0011 + sample(0) * 0.001;
  const rrMin = 1.1 + sample(8) * 0.75;

  return {
    id: createModelId(name),
    name,
    kind: "Model",
    riskMin,
    riskMax: riskMin + 0.0018 + sample(16) * 0.0022,
    rrMin,
    rrMax: rrMin + 0.75 + sample(24) * 1,
    longBias: 0.45 + sample(4) * 0.12,
    winRate: 0.5 + sample(12) * 0.14
  };
};

const buildModelProfiles = (aiZipModelNames: string[]): ModelProfile[] => {
  const seen = new Set<string>([basePersonProfile.id]);
  const profiles: ModelProfile[] = [basePersonProfile];

  for (const rawName of aiZipModelNames) {
    const name = rawName.trim();

    if (!name) {
      continue;
    }

    const modelId = createModelId(name);

    if (seen.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    profiles.push(createSyntheticModelProfile(name));
  }

  return profiles;
};

const futuresAssets: FutureAsset[] = [
  {
    symbol: "XAUUSD",
    name: "XAU / USD",
    basePrice: 2945.25,
    openInterest: "OANDA + CH",
    funding: "CFD"
  }
];

const timeframes: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

const marketTimeframeMap: Record<Timeframe, string> = {
  "1m": "M1",
  "5m": "M5",
  "15m": "M15",
  "1H": "H1",
  "4H": "H4",
  "1D": "D",
  "1W": "W"
};

const timeframeMinutes: Record<Timeframe, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1H": 60,
  "4H": 240,
  "1D": 1440,
  "1W": 10080
};

const timeframeVisibleCount: Record<Timeframe, number> = {
  "1m": 150,
  "5m": 130,
  "15m": 115,
  "1H": 100,
  "4H": 88,
  "1D": 74,
  "1W": 62
};

const sidebarTabs: Array<{ id: PanelTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "assets", label: "Assets" },
  { id: "models", label: "Models" },
  { id: "mt5", label: "MT5" },
  { id: "history", label: "History" },
  { id: "actions", label: "Action" },
  { id: "ai", label: "AI" }
];

const surfaceTabs: Array<{ id: SurfaceTab; label: string }> = [
  { id: "chart", label: "Chart" },
  { id: "backtest", label: "Backtest" }
];

const backtestTabs: Array<{ id: BacktestTab; label: string }> = [
  { id: "mainStats", label: "Main Statistics" },
  { id: "mainSettings", label: "Main Settings" },
  { id: "timeSettings", label: "Time Settings" },
  { id: "history", label: "Trading History" },
  { id: "calendar", label: "Calendar" },
  { id: "cluster", label: "Cluster Map" },
  { id: "entryExit", label: "Entry / Exit Stats" },
  { id: "dimensions", label: "Dimension Statistics" },
  { id: "graphs", label: "Statistical Graphs" },
  { id: "propFirm", label: "Prop Firm Tool" }
];

const backtestWeekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const backtestSessionLabels = ["Asia", "London", "New York", "Late"] as const;
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

const candleHistoryCountByTimeframe: Record<Timeframe, number> = {
  "1m": 25000,
  "5m": 12000,
  "15m": 8000,
  "1H": 3000,
  "4H": 1500,
  "1D": 700,
  "1W": 180
};

const symbolTimeframeKey = (symbol: string, timeframe: Timeframe) => {
  return `${symbol}__${timeframe}`;
};

const getTimeframeMs = (timeframe: Timeframe): number => {
  return timeframeMinutes[timeframe] * 60_000;
};

const floorToTimeframe = (timestampMs: number, timeframe: Timeframe): number => {
  const step = getTimeframeMs(timeframe);
  return Math.floor(timestampMs / step) * step;
};

const isXauTradingTime = (timestampMs: number): boolean => {
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();

  if (day === 6) {
    return false;
  }

  if (day === 5 && hour >= 22) {
    return false;
  }

  if (day === 0 && hour < 23) {
    return false;
  }

  if (day >= 1 && day <= 4 && hour === 22) {
    return false;
  }

  return true;
};

const normalizeMarketCandles = (candles: MarketApiCandle[]): Candle[] => {
  const normalized = candles
    .map((candle) => {
      let timeValue = Number.NaN;

      if (typeof candle.time === "number") {
        timeValue = candle.time;
      } else {
        const numericTime = Number(candle.time);
        timeValue = Number.isFinite(numericTime) ? numericTime : Date.parse(String(candle.time));
      }

      const time = timeValue > 1_000_000_000_000 ? timeValue : timeValue * 1000;
      const open = Number(candle.open);
      const highRaw = Number(candle.high);
      const lowRaw = Number(candle.low);
      const close = Number(candle.close);
      const high = Math.max(open, highRaw, lowRaw, close);
      const low = Math.min(open, highRaw, lowRaw, close);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !isXauTradingTime(time)
      ) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close
      };
    })
    .filter((candle): candle is Candle => candle !== null)
    .sort((a, b) => a.time - b.time);

  const deduped: Candle[] = [];

  for (const candle of normalized) {
    const previous = deduped[deduped.length - 1];

    if (previous && previous.time === candle.time) {
      deduped[deduped.length - 1] = candle;
      continue;
    }

    deduped.push(candle);
  }

  return deduped;
};

const mergeLivePriceIntoCandles = (
  candles: Candle[],
  price: number,
  timestampMs: number,
  timeframe: Timeframe
): Candle[] => {
  const bucketTime = floorToTimeframe(timestampMs, timeframe);

  if (!isXauTradingTime(bucketTime)) {
    return candles;
  }

  if (candles.length === 0) {
    return [
      {
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price
      }
    ];
  }

  const next = candles.slice();
  const last = next[next.length - 1];

  if (bucketTime < last.time) {
    return candles;
  }

  if (bucketTime === last.time) {
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price
    };
  } else {
    const step = getTimeframeMs(timeframe);
    let previousClose = last.close;
    let time = last.time + step;

    while (time < bucketTime) {
      if (isXauTradingTime(time)) {
        next.push({
          time,
          open: previousClose,
          high: previousClose,
          low: previousClose,
          close: previousClose
        });
      }

      time += step;
    }

    next.push({
      time: bucketTime,
      open: previousClose,
      high: Math.max(previousClose, price),
      low: Math.min(previousClose, price),
      close: price
    });
  }

  const maxBars = candleHistoryCountByTimeframe[timeframe];

  return next.length > maxBars ? next.slice(next.length - maxBars) : next;
};

const mergeRecentCandles = (
  historical: Candle[],
  liveWindow: Candle[],
  maxBars: number
): Candle[] => {
  if (liveWindow.length === 0) {
    return historical.slice(-maxBars);
  }

  const firstLiveTime = liveWindow[0].time;
  const merged = [...historical.filter((row) => row.time < firstLiveTime), ...liveWindow];
  const deduped: Candle[] = [];

  for (const row of merged) {
    const previous = deduped[deduped.length - 1];

    if (previous && previous.time === row.time) {
      deduped[deduped.length - 1] = row;
    } else {
      deduped.push(row);
    }
  }

  return deduped.slice(-maxBars);
};

const fetchMarketCandles = async (timeframe: Timeframe, limit: number): Promise<Candle[]> => {
  const params = new URLSearchParams({
    pair: XAUUSD_PAIR,
    timeframe: marketTimeframeMap[timeframe],
    limit: String(Math.min(limit, MAX_REMOTE_HISTORY_CANDLES))
  });

  const response = await fetch(`/api/market/candles?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();

  return normalizeMarketCandles(payload.candles || []);
};

const fetchHistoryApiCandles = async (timeframe: Timeframe, count: number): Promise<Candle[]> => {
  const params = new URLSearchParams({
    pair: XAUUSD_PAIR,
    timeframe: marketTimeframeMap[timeframe],
    count: String(count)
  });

  const response = await fetch(`/api/history/candles?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();

  return normalizeMarketCandles(payload.candles || []);
};

const fetchHistoryCandles = async (timeframe: Timeframe): Promise<Candle[]> => {
  const targetBars = Math.min(candleHistoryCountByTimeframe[timeframe], MAX_REMOTE_HISTORY_CANDLES);

  try {
    const historyCandles = await fetchHistoryApiCandles(timeframe, targetBars);

    if (historyCandles.length >= MIN_SEED_CANDLES) {
      return historyCandles.slice(-targetBars);
    }
  } catch {
    // Leave the chart empty until a real history or live refresh arrives.
  }

  return [];
};

const XAUUSD_PAIR = "XAU_USD";
const MIN_SEED_CANDLES = 40;
const MAX_REMOTE_HISTORY_CANDLES = 25_000;
const LIVE_MARKET_SYNC_LIMIT = 160;
const MARKET_API_KEY =
  process.env.NEXT_PUBLIC_PRICE_STREAM_API_KEY ||
  process.env.NEXT_PUBLIC_MARKET_API_KEY ||
  "trd_PCv-kkjDo-4t4QMDNxz3JRCGIyBCKHNq";
const PRICE_STREAM_URL =
  process.env.NEXT_PUBLIC_PRICE_STREAM_URL ||
  "https://oanda-worker-production.up.railway.app/stream/prices";

const hashString = (value: string) => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash) + 1;
};

const createSeededRng = (seed: number) => {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;

    return (state - 1) / 2147483646;
  };
};

const formatPrice = (value: number): string => {
  if (value < 1) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
  }

  if (value < 100) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  });
};

const formatDateTime = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
};

const formatUnits = (value: number): string => {
  if (value >= 100) {
    return value.toFixed(0);
  }

  if (value >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(4);
};

const formatUsd = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const formatSignedUsd = (value: number): string => {
  return `${value >= 0 ? "+" : "-"}$${formatUsd(Math.abs(value))}`;
};

const formatSignedPercent = (value: number): string => {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
};

const getTradeDayKey = (timestampSeconds: UTCTimestamp): string => {
  return new Date(Number(timestampSeconds) * 1000).toISOString().slice(0, 10);
};

const getTradeMonthKey = (timestampSeconds: UTCTimestamp): string => {
  return getTradeDayKey(timestampSeconds).slice(0, 7);
};

const getTradeMonthIndex = (timestampSeconds: UTCTimestamp): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCMonth();
};

const getTradeHour = (timestampSeconds: UTCTimestamp): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCHours();
};

const getTradeWeekKey = (timestampSeconds: UTCTimestamp): string => {
  const date = new Date(Number(timestampSeconds) * 1000);
  const day = date.getUTCDay();
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)
  );

  return weekStart.toISOString().slice(0, 10);
};

const getMonthLabel = (monthKey: string): string => {
  const [year, month] = monthKey.split("-").map((value) => Number(value));

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return monthKey;
  }

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
};

const getCalendarDateLabel = (dateKey: string): string => {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
};

const getWeekdayLabel = (dateKey: string): string => {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC"
  });
};

const getSessionLabel = (timestampSeconds: UTCTimestamp): string => {
  const hour = getTradeHour(timestampSeconds);

  if (hour < 7) {
    return "Asia";
  }

  if (hour < 12) {
    return "London";
  }

  if (hour < 17) {
    return "New York";
  }

  return "Late";
};

const formatMinutesCompact = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0m";
  }

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
};

const getBacktestExitLabel = (trade: HistoryItem): string => {
  const targetGap = Math.abs(trade.targetPrice - trade.entryPrice);
  const stopGap = Math.abs(trade.entryPrice - trade.stopPrice);
  const realizedGap = Math.abs(trade.outcomePrice - trade.entryPrice);

  if (trade.result === "Win" && realizedGap >= targetGap * 0.84) {
    return "Target Hit";
  }

  if (trade.result === "Loss" && realizedGap >= stopGap * 0.84) {
    return "Protective Stop";
  }

  return "Managed Exit";
};

const getBacktestScatterValue = (trade: HistoryItem, key: BacktestScatterKey): number => {
  if (key === "pnlUsd") {
    return trade.pnlUsd;
  }

  if (key === "pnlPct") {
    return trade.pnlPct;
  }

  if (key === "holdMinutes") {
    return Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
  }

  if (key === "units") {
    return trade.units;
  }

  return getTradeConfidenceScore(trade) * 100;
};

const getBacktestScatterLabel = (key: BacktestScatterKey): string => {
  if (key === "pnlUsd") {
    return "PnL ($)";
  }

  if (key === "pnlPct") {
    return "PnL (%)";
  }

  if (key === "holdMinutes") {
    return "Hold Time";
  }

  if (key === "units") {
    return "Position Size";
  }

  return "Confidence";
};

const formatBacktestScatterValue = (key: BacktestScatterKey, value: number): string => {
  if (key === "pnlUsd") {
    return formatSignedUsd(value);
  }

  if (key === "pnlPct") {
    return formatSignedPercent(value);
  }

  if (key === "holdMinutes") {
    return formatMinutesCompact(value);
  }

  if (key === "units") {
    return `${formatUnits(value)} u`;
  }

  return `${value.toFixed(1)}%`;
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

const buildSparklinePath = (values: number[], width: number, height: number): string => {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.000001, max - min);

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;

      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

const formatElapsed = (
  openedAtSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): string => {
  const total = Math.max(0, nowSeconds - openedAtSeconds);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
};

const formatClock = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const getExitMarkerPosition = (
  side: TradeSide,
  result: TradeResult
): "aboveBar" | "belowBar" => {
  if (side === "Long") {
    return result === "Win" ? "aboveBar" : "belowBar";
  }

  return result === "Win" ? "belowBar" : "aboveBar";
};

const evaluateTpSlPath = (
  candles: Candle[],
  side: TradeSide,
  entryIndex: number,
  targetPrice: number,
  stopPrice: number,
  toIndex = candles.length - 1
): { hit: boolean; hitIndex: number; outcomePrice: number; result: TradeResult | null } => {
  const safeEndIndex = Math.min(Math.max(entryIndex + 1, toIndex), candles.length - 1);
  let hitIndex = -1;
  let outcomePrice = candles[safeEndIndex]?.close ?? candles[entryIndex]?.close ?? 0;
  let result: TradeResult | null = null;

  for (let i = entryIndex + 1; i <= safeEndIndex; i += 1) {
    const candle = candles[i];

    if (!candle) {
      break;
    }

    const hitTarget = side === "Long" ? candle.high >= targetPrice : candle.low <= targetPrice;
    const hitStop = side === "Long" ? candle.low <= stopPrice : candle.high >= stopPrice;

    if (!hitTarget && !hitStop) {
      continue;
    }

    hitIndex = i;

    if (hitTarget && hitStop) {
      const targetFirst =
        Math.abs(candle.open - targetPrice) <= Math.abs(candle.open - stopPrice);
      result = targetFirst ? "Win" : "Loss";
      outcomePrice = targetFirst ? targetPrice : stopPrice;
    } else if (hitTarget) {
      result = "Win";
      outcomePrice = targetPrice;
    } else {
      result = "Loss";
      outcomePrice = stopPrice;
    }

    break;
  }

  return { hit: hitIndex >= 0, hitIndex, outcomePrice, result };
};

const toUtcTimestamp = (ms: number): UTCTimestamp => {
  return Math.floor(ms / 1000) as UTCTimestamp;
};

const parseTimeFromCrosshair = (time: Time): number | null => {
  if (typeof time === "number") {
    return time;
  }

  if (typeof time === "string") {
    const parsed = Date.parse(time);

    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }

  if ("year" in time) {
    return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
  }

  return null;
};

const getAssetBySymbol = (symbol: string): FutureAsset => {
  return futuresAssets.find((asset) => asset.symbol === symbol) ?? futuresAssets[0];
};

const findCandleIndexAtOrBefore = (candles: Candle[], targetMs: number): number => {
  if (candles.length === 0) {
    return -1;
  }

  if (targetMs < candles[0].time) {
    return -1;
  }

  if (targetMs >= candles[candles.length - 1].time) {
    return candles.length - 1;
  }

  let left = 0;
  let right = candles.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const time = candles[mid].time;

    if (time === targetMs) {
      return mid;
    }

    if (time < targetMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return Math.max(0, right);
};

const generateTradeBlueprints = (
  model: ModelProfile,
  total = 64,
  nowMs = floorToTimeframe(Date.now(), "1m")
): TradeBlueprint[] => {
  const rand = createSeededRng(hashString(`blueprints-${model.id}`));
  const blueprints: TradeBlueprint[] = [];
  const usedTimes = new Set<number>();

  for (let i = 0; i < total; i += 1) {
    const symbol = futuresAssets[Math.floor(rand() * futuresAssets.length)].symbol;
    const side: TradeSide = rand() <= model.longBias ? "Long" : "Short";
    const result: TradeResult = rand() <= model.winRate ? "Win" : "Loss";
    const rr = model.rrMin + rand() * (model.rrMax - model.rrMin);
    const riskPct = model.riskMin + rand() * (model.riskMax - model.riskMin);
    const holdMinutes = 35 + Math.floor(rand() * 780);
    const exitOffsetMinutes = 45 + i * 63 + Math.floor(rand() * 28);
    const exitMs = nowMs - exitOffsetMinutes * 60_000;
    const uniqueExitMs = exitMs - (usedTimes.has(exitMs) ? (i + 1) * 1_000 : 0);
    usedTimes.add(uniqueExitMs);
    const entryMs = uniqueExitMs - holdMinutes * 60_000;
    const units = 0.4 + rand() * 3.6;

    blueprints.push({
      id: `${model.id}-t${String(i + 1).padStart(2, "0")}`,
      modelId: model.id,
      symbol,
      side,
      result,
      entryMs,
      exitMs: uniqueExitMs,
      riskPct,
      rr,
      units
    });
  }

  return blueprints.sort((a, b) => b.exitMs - a.exitMs);
};

const TabIcon = ({ tab }: { tab: PanelTab }) => {
  if (tab === "active") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      </svg>
    );
  }

  if (tab === "assets") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 17l4-5 3 3 5-7 4 9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  if (tab === "models") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="8" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.2" cy="8.4" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4.5 17.8c.6-2 2-3.1 3.5-3.1h.1c1.6 0 2.9 1.1 3.5 3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12.8 17.4c.5-1.6 1.6-2.5 2.9-2.5h.1c1.4 0 2.4.9 2.9 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (tab === "mt5") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M9 6.5v4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M15 6.5v4.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M9 10.9h6v1.6a3 3 0 0 1-3 3 3 3 0 0 1-3-3v-1.6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M12 15.5v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (tab === "history") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 7v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M7.5 16.5a7 7 0 1 0-1.5-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (tab === "actions") {
    return (
      <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
        <path d="M7 6h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 12h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 18h10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg className="rail-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 4l2.2 4.8L19 10l-3.6 3.3.9 4.7-4.3-2.4-4.3 2.4.9-4.7L5 10l4.8-1.2L12 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
};

export default function TradingTerminal({ aiZipModelNames }: TradingTerminalProps) {
  const modelProfiles = useMemo(() => {
    return buildModelProfiles(aiZipModelNames);
  }, [aiZipModelNames]);
  const referenceNowMs = useMemo(() => {
    return floorToTimeframe(Date.now(), "1m");
  }, []);
  const [selectedSymbol, setSelectedSymbol] = useState(futuresAssets[0].symbol);
  const [selectedModelId, setSelectedModelId] = useState(modelProfiles[0]?.id ?? "");
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("15m");
  const [selectedSurfaceTab, setSelectedSurfaceTab] = useState<SurfaceTab>("chart");
  const [selectedBacktestTab, setSelectedBacktestTab] = useState<BacktestTab>("mainStats");
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("active");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [showAllTradesOnChart, setShowAllTradesOnChart] = useState(false);
  const [showActiveTradeOnChart, setShowActiveTradeOnChart] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>({});
  const [backtestHistoryQuery, setBacktestHistoryQuery] = useState("");
  const [selectedBacktestMonthKey, setSelectedBacktestMonthKey] = useState("");
  const [selectedBacktestDateKey, setSelectedBacktestDateKey] = useState("");
  const [enabledBacktestWeekdays, setEnabledBacktestWeekdays] = useState<string[]>([
    ...backtestWeekdayLabels
  ]);
  const [enabledBacktestSessions, setEnabledBacktestSessions] = useState<string[]>([
    ...backtestSessionLabels
  ]);
  const [enabledBacktestMonths, setEnabledBacktestMonths] = useState<number[]>(
    Array.from({ length: 12 }, (_, index) => index)
  );
  const [enabledBacktestHours, setEnabledBacktestHours] = useState<number[]>(
    Array.from({ length: 24 }, (_, index) => index)
  );
  const [aiMode, setAiMode] = useState<"off" | "knn" | "hdbscan">("knn");
  const [aiModelEnabled, setAiModelEnabled] = useState(true);
  const [aiFilterEnabled, setAiFilterEnabled] = useState(true);
  const [staticLibrariesClusters, setStaticLibrariesClusters] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(42);
  const [aiExitStrictness, setAiExitStrictness] = useState(18);
  const [aiExitLossTolerance, setAiExitLossTolerance] = useState(0);
  const [aiExitWinTolerance, setAiExitWinTolerance] = useState(0);
  const [useMitExit, setUseMitExit] = useState(false);
  const [complexity, setComplexity] = useState(58);
  const [volatilityPercentile, setVolatilityPercentile] = useState(30);
  const [tpDollars, setTpDollars] = useState(220);
  const [slDollars, setSlDollars] = useState(120);
  const [dollarsPerMove, setDollarsPerMove] = useState(100);
  const [maxBarsInTrade, setMaxBarsInTrade] = useState(32);
  const [propInitialBalance, setPropInitialBalance] = useState(10_000);
  const [propDailyMaxLoss, setPropDailyMaxLoss] = useState(350);
  const [propTotalMaxLoss, setPropTotalMaxLoss] = useState(900);
  const [propProfitTarget, setPropProfitTarget] = useState(800);
  const [entryExitChartMode, setEntryExitChartMode] = useState<EntryExitChartMode>("entry");
  const [backtestDimensionQuery, setBacktestDimensionQuery] = useState("");
  const [scatterXKey, setScatterXKey] = useState<BacktestScatterKey>("pnlUsd");
  const [scatterYKey, setScatterYKey] = useState<BacktestScatterKey>("holdMinutes");
  const [propProjectionMethod, setPropProjectionMethod] = useState<"historical" | "montecarlo">(
    "historical"
  );

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const tradeProfitZoneRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const tradeLossZoneRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const tradeEntryLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradeTargetLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradeStopLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tradePathLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const multiTradeSeriesRef = useRef<MultiTradeOverlaySeries[]>([]);
  const selectionRef = useRef<string>("");
  const focusTradeIdRef = useRef<string | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  const selectedAsset = useMemo(() => {
    return getAssetBySymbol(selectedSymbol);
  }, [selectedSymbol]);
  const selectedModel = useMemo(() => {
    return modelProfiles.find((model) => model.id === selectedModelId) ?? modelProfiles[0]!;
  }, [modelProfiles, selectedModelId]);

  const selectedKey = symbolTimeframeKey(selectedSymbol, selectedTimeframe);

  useEffect(() => {
    if (!modelProfiles.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(modelProfiles[0]?.id ?? "");
    }
  }, [modelProfiles, selectedModelId]);

  useEffect(() => {
    setHoveredTime(null);
  }, [selectedTimeframe]);

  useEffect(() => {
    let cancelled = false;
    let stream: EventSource | null = null;
    let liveSyncInterval = 0;
    const key = selectedKey;
    const historyLimit = candleHistoryCountByTimeframe[selectedTimeframe];

    const connect = async () => {
      try {
        const historicalCandles = await fetchHistoryCandles(selectedTimeframe);

        if (!cancelled && historicalCandles.length > 0) {
          setSeriesMap((prev) => ({
            ...prev,
            [key]: historicalCandles
          }));
        }
      } catch {
        // Keep the last real candle state if historical loading is unavailable.
      }

      const syncLiveCandlesFromMarket = async () => {
        try {
          const liveCandles = await fetchMarketCandles(selectedTimeframe, LIVE_MARKET_SYNC_LIMIT);

          if (cancelled || liveCandles.length === 0) {
            return;
          }

          setSeriesMap((prev) => ({
            ...prev,
            [key]: mergeRecentCandles(prev[key] ?? [], liveCandles, historyLimit)
          }));
        } catch {
          // Tick updates can continue even if the live candle window refresh fails.
        }
      };

      await syncLiveCandlesFromMarket();

      if (cancelled) {
        return;
      }

      liveSyncInterval = window.setInterval(() => {
        void syncLiveCandlesFromMarket();
      }, 8000);

      stream = new EventSource(
        `${PRICE_STREAM_URL}?${new URLSearchParams({
          api_key: MARKET_API_KEY,
          pairs: XAUUSD_PAIR
        }).toString()}`
      );
      streamRef.current = stream;

      stream.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if ((message.pair || "").toUpperCase() !== XAUUSD_PAIR) {
            return;
          }

          const price = Number(message.mid);
          const eventTime = Date.parse(String(message.time));

          if (!Number.isFinite(price) || !Number.isFinite(eventTime)) {
            return;
          }

          setSeriesMap((prev) => ({
            ...prev,
            [key]: mergeLivePriceIntoCandles(prev[key] ?? [], price, eventTime, selectedTimeframe)
          }));
        } catch {
          // Ignore malformed stream events and keep the feed alive.
        }
      };
    };

    void connect();

    return () => {
      cancelled = true;

      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }

      if (liveSyncInterval) {
        window.clearInterval(liveSyncInterval);
      }

      stream?.close();
    };
  }, [selectedKey, selectedTimeframe]);

  const selectedCandles = useMemo(() => {
    return seriesMap[selectedKey] ?? EMPTY_CANDLES;
  }, [selectedKey, seriesMap]);

  const candleByUnix = useMemo(() => {
    const map = new Map<number, Candle>();

    for (const candle of selectedCandles) {
      map.set(toUtcTimestamp(candle.time), candle);
    }

    return map;
  }, [selectedCandles]);

  const latestCandle = selectedCandles[selectedCandles.length - 1] ?? null;
  const previousCandle =
    selectedCandles.length > 1 ? selectedCandles[selectedCandles.length - 2] : latestCandle;

  const quoteChange =
    latestCandle && previousCandle && previousCandle.close > 0
      ? ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100
      : 0;

  const hoveredCandle =
    latestCandle && hoveredTime ? candleByUnix.get(hoveredTime) ?? latestCandle : latestCandle;

  const hoveredChange =
    hoveredCandle && hoveredCandle.open > 0
      ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100
      : 0;

  const watchlistRows = useMemo(() => {
    return futuresAssets.map((asset) => {
      const key = symbolTimeframeKey(asset.symbol, selectedTimeframe);
      const list = seriesMap[key] ?? [];
      const last = list[list.length - 1];
      const prev = list[list.length - 2] ?? last;
      const change =
        last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;

      return {
        ...asset,
        lastPrice: last?.close ?? null,
        change
      };
    });
  }, [selectedTimeframe, seriesMap]);

  const tradeBlueprints = useMemo(() => {
    return generateTradeBlueprints(
      selectedModel,
      64,
      floorToTimeframe(referenceNowMs, "1m")
    );
  }, [referenceNowMs, selectedModel]);

  const activeTrade = useMemo<ActiveTrade | null>(() => {
    if (selectedCandles.length < 70) {
      return null;
    }

    const latestIndex = selectedCandles.length - 1;
    const latest = selectedCandles[latestIndex];
    const rand = createSeededRng(hashString(`active-${selectedModel.id}-${selectedSymbol}`));
    const nowMs = floorToTimeframe(referenceNowMs, "1m");
    const lookbackMinutes = 28 + Math.floor(rand() * 520);
    let entryIndex = findCandleIndexAtOrBefore(selectedCandles, nowMs - lookbackMinutes * 60_000);

    if (entryIndex < 22 || entryIndex >= latestIndex - 4) {
      const fallbackBars = 28 + Math.floor(rand() * Math.max(8, Math.min(220, latestIndex - 30)));
      entryIndex = Math.max(20, latestIndex - fallbackBars);
    }

    const entryPrice = selectedCandles[entryIndex].close;
    const side: TradeSide = rand() <= selectedModel.longBias ? "Long" : "Short";
    const rr = selectedModel.rrMin + rand() * (selectedModel.rrMax - selectedModel.rrMin);

    let atr = 0;
    let atrCount = 0;

    for (let i = Math.max(1, entryIndex - 28); i <= entryIndex; i += 1) {
      atr += selectedCandles[i].high - selectedCandles[i].low;
      atrCount += 1;
    }

    atr /= Math.max(1, atrCount);

    let riskPerUnit = Math.max(
      entryPrice * (selectedModel.riskMin + rand() * (selectedModel.riskMax - selectedModel.riskMin)),
      atr * (0.75 + rand() * 1.1)
    );

    let stopPrice = side === "Long" ? Math.max(0.000001, entryPrice - riskPerUnit) : entryPrice + riskPerUnit;
    let targetPrice =
      side === "Long"
        ? entryPrice + riskPerUnit * rr
        : Math.max(0.000001, entryPrice - riskPerUnit * rr);

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const path = evaluateTpSlPath(
        selectedCandles,
        side,
        entryIndex,
        targetPrice,
        stopPrice,
        latestIndex
      );

      if (!path.hit) {
        break;
      }

      riskPerUnit *= 1.22;
      stopPrice =
        side === "Long" ? Math.max(0.000001, entryPrice - riskPerUnit) : entryPrice + riskPerUnit;
      targetPrice =
        side === "Long"
          ? entryPrice + riskPerUnit * rr
          : Math.max(0.000001, entryPrice - riskPerUnit * rr);
    }

    const maxRiskUsd = 60 + rand() * 240;
    const maxNotionalUsd = 1400 + rand() * 5200;
    const units = Math.max(
      0.001,
      Math.min(
        maxRiskUsd / Math.max(0.000001, riskPerUnit),
        maxNotionalUsd / Math.max(0.000001, entryPrice)
      )
    );
    const markPrice = latest.close;
    const pnlPct =
      side === "Long"
        ? ((markPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - markPrice) / entryPrice) * 100;
    const pnlValue = side === "Long" ? (markPrice - entryPrice) * units : (entryPrice - markPrice) * units;
    const progressRaw =
      side === "Long"
        ? (markPrice - stopPrice) / Math.max(0.000001, targetPrice - stopPrice)
        : (stopPrice - markPrice) / Math.max(0.000001, stopPrice - targetPrice);
    const openedAt = toUtcTimestamp(selectedCandles[entryIndex].time);

    return {
      symbol: selectedSymbol,
      side,
      units,
      entryPrice,
      markPrice,
      targetPrice,
      stopPrice,
      openedAt,
      openedAtLabel: formatDateTime(selectedCandles[entryIndex].time),
      elapsed: formatElapsed(Number(openedAt), Math.floor(referenceNowMs / 1000)),
      pnlPct,
      pnlValue,
      progressPct: clamp(progressRaw * 100, 0, 100),
      rr
    };
  }, [referenceNowMs, selectedCandles, selectedModel, selectedSymbol]);

  const historyRows = useMemo(() => {
    const rows: HistoryItem[] = [];

    for (const blueprint of tradeBlueprints) {
      const key = symbolTimeframeKey(blueprint.symbol, selectedTimeframe);
      const list = seriesMap[key] ?? [];

      if (list.length < 16) {
        continue;
      }

      const entryIndex = findCandleIndexAtOrBefore(list, blueprint.entryMs);
      const rawExitIndex = findCandleIndexAtOrBefore(list, blueprint.exitMs);

      if (entryIndex < 0 || rawExitIndex < 0) {
        continue;
      }

      const exitIndex = Math.min(list.length - 1, Math.max(entryIndex + 1, rawExitIndex));

      if (exitIndex <= entryIndex) {
        continue;
      }

      const entryPrice = list[entryIndex].close;
      const rand = createSeededRng(hashString(`mapped-${blueprint.id}`));
      let atr = 0;
      let atrCount = 0;

      for (let i = Math.max(1, entryIndex - 20); i <= entryIndex; i += 1) {
        atr += list[i].high - list[i].low;
        atrCount += 1;
      }

      atr /= Math.max(1, atrCount);

      const riskPerUnit = Math.max(
        entryPrice * blueprint.riskPct,
        atr * (0.6 + rand() * 0.6),
        entryPrice * 0.0009
      );
      const stopPrice =
        blueprint.side === "Long"
          ? Math.max(0.000001, entryPrice - riskPerUnit)
          : entryPrice + riskPerUnit;
      const targetPrice =
        blueprint.side === "Long"
          ? entryPrice + riskPerUnit * blueprint.rr
          : Math.max(0.000001, entryPrice - riskPerUnit * blueprint.rr);
      const path = evaluateTpSlPath(
        list,
        blueprint.side,
        entryIndex,
        targetPrice,
        stopPrice,
        exitIndex
      );

      const resolvedExitIndex = path.hit ? path.hitIndex : exitIndex;
      const rawOutcomePrice = path.hit ? path.outcomePrice : list[resolvedExitIndex].close;
      const outcomePrice = Math.max(0.000001, rawOutcomePrice);
      const result: TradeResult = path.hit
        ? (path.result ?? "Loss")
        : blueprint.side === "Long"
          ? outcomePrice >= entryPrice
            ? "Win"
            : "Loss"
          : outcomePrice <= entryPrice
            ? "Win"
            : "Loss";
      const pnlPct =
        blueprint.side === "Long"
          ? ((outcomePrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - outcomePrice) / entryPrice) * 100;
      const pnlUsd =
        blueprint.side === "Long"
          ? (outcomePrice - entryPrice) * blueprint.units
          : (entryPrice - outcomePrice) * blueprint.units;

      rows.push({
        id: blueprint.id,
        symbol: blueprint.symbol,
        side: blueprint.side,
        result,
        pnlPct,
        pnlUsd,
        entryTime: toUtcTimestamp(list[entryIndex].time),
        exitTime: toUtcTimestamp(list[resolvedExitIndex].time),
        entryPrice,
        targetPrice,
        stopPrice,
        outcomePrice,
        units: blueprint.units,
        entryAt: formatDateTime(list[entryIndex].time),
        exitAt: formatDateTime(list[resolvedExitIndex].time),
        time: formatDateTime(list[resolvedExitIndex].time)
      });
    }

    return rows.sort((a, b) => Number(b.exitTime) - Number(a.exitTime)).slice(0, 60);
  }, [tradeBlueprints, selectedTimeframe, seriesMap]);

  const selectedHistoryTrade = useMemo(() => {
    if (!selectedHistoryId) {
      return null;
    }

    return historyRows.find((row) => row.id === selectedHistoryId) ?? null;
  }, [historyRows, selectedHistoryId]);

  const currentSymbolHistoryRows = useMemo(() => {
    return historyRows.filter((row) => row.symbol === selectedSymbol);
  }, [historyRows, selectedSymbol]);

  const candleIndexByUnix = useMemo(() => {
    const map = new Map<number, number>();

    for (let i = 0; i < selectedCandles.length; i += 1) {
      map.set(toUtcTimestamp(selectedCandles[i].time), i);
    }

    return map;
  }, [selectedCandles]);

  const activeChartTrade = useMemo<OverlayTrade | null>(() => {
    if (!activeTrade || selectedCandles.length === 0) {
      return null;
    }

    const latestTime = toUtcTimestamp(selectedCandles[selectedCandles.length - 1].time);

    return {
      id: "active-live",
      symbol: activeTrade.symbol,
      side: activeTrade.side,
      status: "pending",
      entryTime: activeTrade.openedAt,
      exitTime:
        latestTime > activeTrade.openedAt
          ? latestTime
          : ((activeTrade.openedAt + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp),
      entryPrice: activeTrade.entryPrice,
      targetPrice: activeTrade.targetPrice,
      stopPrice: activeTrade.stopPrice,
      outcomePrice: activeTrade.markPrice,
      result: activeTrade.pnlValue >= 0 ? "Win" : "Loss",
      pnlUsd: activeTrade.pnlValue
    };
  }, [activeTrade, selectedCandles, selectedTimeframe]);

  const actionRows = useMemo(() => {
    const rows: ActionItem[] = [];
    const stepSeconds = timeframeMinutes[selectedTimeframe] * 60;

    for (const trade of historyRows) {
      rows.push({
        id: `${trade.id}-entry`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: `${trade.side === "Long" ? "Buy" : "Sell"} Order Placed`,
        details: `${formatUnits(trade.units)} units @ ${formatPrice(trade.entryPrice)}`,
        timestamp: trade.entryTime,
        time: formatDateTime(Number(trade.entryTime) * 1000)
      });
      rows.push({
        id: `${trade.id}-sl`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: "SL Added",
        details: `Stop-loss @ ${formatPrice(trade.stopPrice)}`,
        timestamp: (trade.entryTime + Math.max(1, Math.floor(stepSeconds * 0.1))) as UTCTimestamp,
        time: formatDateTime(
          (Number(trade.entryTime) + Math.max(1, Math.floor(stepSeconds * 0.1))) * 1000
        )
      });
      rows.push({
        id: `${trade.id}-tp`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: "TP Added",
        details: `Take-profit @ ${formatPrice(trade.targetPrice)}`,
        timestamp: (trade.entryTime + Math.max(2, Math.floor(stepSeconds * 0.2))) as UTCTimestamp,
        time: formatDateTime(
          (Number(trade.entryTime) + Math.max(2, Math.floor(stepSeconds * 0.2))) * 1000
        )
      });
      rows.push({
        id: `${trade.id}-exit`,
        tradeId: trade.id,
        symbol: trade.symbol,
        label: `${trade.result} Closed`,
        details: `${formatSignedUsd(trade.pnlUsd)} (${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(
          2
        )}%) @ ${formatPrice(trade.outcomePrice)}`,
        timestamp: trade.exitTime,
        time: trade.exitAt
      });
    }

    return rows.sort(
      (a, b) => Number(b.timestamp) - Number(a.timestamp) || b.id.localeCompare(a.id)
    );
  }, [historyRows, selectedTimeframe]);

  const notificationItems = useMemo<NotificationItem[]>(() => {
    const items: NotificationItem[] = [];
    const now = Date.now();

    if (activeTrade) {
      const liveTitle =
        activeTrade.progressPct >= 78
          ? `${activeTrade.symbol} near TP`
          : activeTrade.progressPct <= 22
            ? `${activeTrade.symbol} near SL`
            : `${activeTrade.symbol} mark update`;
      const liveTone: NotificationTone =
        activeTrade.progressPct >= 78
          ? "up"
          : activeTrade.progressPct <= 22
            ? "down"
            : "neutral";

      items.push({
        id: `live-progress-${activeTrade.symbol}`,
        title: liveTitle,
        details: `Progress ${activeTrade.progressPct.toFixed(1)}% | TP ${formatPrice(
          activeTrade.targetPrice
        )} | SL ${formatPrice(activeTrade.stopPrice)}`,
        time: formatClock(now),
        timestamp: now,
        tone: liveTone,
        live: true
      });

      items.push({
        id: `live-pnl-${activeTrade.symbol}`,
        title: `${activeTrade.symbol} unrealized`,
        details: `${activeTrade.pnlValue >= 0 ? "+" : "-"}$${formatUsd(
          Math.abs(activeTrade.pnlValue)
        )} (${activeTrade.pnlPct >= 0 ? "+" : ""}${activeTrade.pnlPct.toFixed(2)}%)`,
        time: formatClock(now - 1000),
        timestamp: now - 1000,
        tone: activeTrade.pnlValue >= 0 ? "up" : "down",
        live: true
      });
    }

    for (const action of actionRows.slice(0, 10)) {
      const title = `${action.symbol} ${action.label}`;
      const tone: NotificationTone =
        action.label === "Win Closed"
          ? "up"
          : action.label === "Loss Closed"
            ? "down"
            : "neutral";

      items.push({
        id: `action-${action.id}`,
        title,
        details: action.details,
        time: action.time,
        timestamp: Number(action.timestamp) * 1000,
        tone
      });
    }

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
  }, [actionRows, activeTrade]);

  const seenNotificationSet = useMemo(() => {
    return new Set(seenNotificationIds);
  }, [seenNotificationIds]);

  const unreadNotificationCount = useMemo(() => {
    return notificationItems.reduce((count, item) => {
      return count + (seenNotificationSet.has(item.id) ? 0 : 1);
    }, 0);
  }, [notificationItems, seenNotificationSet]);

  useEffect(() => {
    if (!selectedHistoryId) {
      return;
    }

    if (!historyRows.some((row) => row.id === selectedHistoryId)) {
      setSelectedHistoryId(null);
    }
  }, [historyRows, selectedHistoryId]);

  useEffect(() => {
    setSelectedHistoryId(null);
    setShowAllTradesOnChart(false);
    setShowActiveTradeOnChart(false);
    focusTradeIdRef.current = null;
  }, [selectedModelId]);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!notificationRef.current) {
        return;
      }

      const target = event.target as Node;

      if (!notificationRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen || notificationItems.length === 0) {
      return;
    }

    setSeenNotificationIds((prev) => {
      const next = new Set(prev);
      let changed = false;

      for (const item of notificationItems) {
        if (!next.has(item.id)) {
          next.add(item.id);
          changed = true;
        }
      }

      return changed ? Array.from(next) : prev;
    });
  }, [notificationsOpen, notificationItems]);

  useEffect(() => {
    const container = chartContainerRef.current;

    if (!container || chartRef.current) {
      return;
    }

    const initialWidth = Math.max(1, Math.floor(container.clientWidth));
    const initialHeight = Math.max(1, Math.floor(container.clientHeight));

    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#090d13" },
        textColor: "#7f889d"
      },
      localization: {
        priceFormatter: (price: number) => formatPrice(price)
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false }
      },
      rightPriceScale: {
        borderVisible: true,
        borderColor: "#182131"
      },
      leftPriceScale: {
        visible: false
      },
      timeScale: {
        borderVisible: true,
        borderColor: "#182131",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(198, 208, 228, 0.28)",
          width: 1,
          style: 3,
          labelBackgroundColor: "#141c2a"
        },
        horzLine: {
          color: "rgba(198, 208, 228, 0.28)",
          width: 1,
          style: 3,
          labelBackgroundColor: "#141c2a"
        }
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#1bae8a",
      downColor: "#f0455a",
      wickUpColor: "#1bae8a",
      wickDownColor: "#f0455a",
      borderUpColor: "#1bae8a",
      borderDownColor: "#f0455a",
      priceLineVisible: false,
      lastValueVisible: true
    });

    const tradeEntryLine = chart.addLineSeries({
      color: "rgba(232, 238, 250, 0.72)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradeTargetLine = chart.addLineSeries({
      color: "rgba(53, 201, 113, 0.95)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradeStopLine = chart.addLineSeries({
      color: "rgba(255, 76, 104, 0.95)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradePathLine = chart.addLineSeries({
      color: "rgba(220, 230, 248, 0.82)",
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradeProfitZone = chart.addBaselineSeries({
      baseValue: { type: "price", price: 0 },
      topLineColor: "rgba(0,0,0,0)",
      topFillColor1: "rgba(53, 201, 113, 0.22)",
      topFillColor2: "rgba(53, 201, 113, 0.05)",
      bottomLineColor: "rgba(0,0,0,0)",
      bottomFillColor1: "rgba(0,0,0,0)",
      bottomFillColor2: "rgba(0,0,0,0)",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    const tradeLossZone = chart.addBaselineSeries({
      baseValue: { type: "price", price: 0 },
      topLineColor: "rgba(0,0,0,0)",
      topFillColor1: "rgba(0,0,0,0)",
      topFillColor2: "rgba(0,0,0,0)",
      bottomLineColor: "rgba(0,0,0,0)",
      bottomFillColor1: "rgba(240, 69, 90, 0.24)",
      bottomFillColor2: "rgba(240, 69, 90, 0.07)",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.point || !param.time) {
        setHoveredTime(null);
        return;
      }

      setHoveredTime(parseTimeFromCrosshair(param.time));
    };

    chart.subscribeCrosshairMove(onCrosshairMove);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));

      chart.applyOptions({
        width,
        height
      });
    });

    resizeObserver.observe(container);

    const settleResize = () => {
      chart.applyOptions({
        width: Math.max(1, Math.floor(container.clientWidth)),
        height: Math.max(1, Math.floor(container.clientHeight))
      });
    };
    const resizeFrameA = window.requestAnimationFrame(settleResize);
    const resizeFrameB = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(settleResize);
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    tradeProfitZoneRef.current = tradeProfitZone;
    tradeLossZoneRef.current = tradeLossZone;
    tradeEntryLineRef.current = tradeEntryLine;
    tradeTargetLineRef.current = tradeTargetLine;
    tradeStopLineRef.current = tradeStopLine;
    tradePathLineRef.current = tradePathLine;

    return () => {
      window.cancelAnimationFrame(resizeFrameA);
      window.cancelAnimationFrame(resizeFrameB);
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      tradeProfitZoneRef.current = null;
      tradeLossZoneRef.current = null;
      tradeEntryLineRef.current = null;
      tradeTargetLineRef.current = null;
      tradeStopLineRef.current = null;
      tradePathLineRef.current = null;
      multiTradeSeriesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;

    if (!chart || !candleSeries) {
      return;
    }

    if (selectedCandles.length === 0) {
      candleSeries.setData([]);
      return;
    }

    const candleData: CandlestickData[] = selectedCandles.map((candle) => ({
      time: toUtcTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close
    }));

    candleSeries.setData(candleData);

    const selection = `${selectedSymbol}-${selectedTimeframe}`;

    if (selectionRef.current !== selection) {
      const to = candleData.length - 1;
      const from = Math.max(0, to - timeframeVisibleCount[selectedTimeframe]);

      chart.applyOptions({
        rightPriceScale: {
          autoScale: true
        }
      });
      chart.timeScale().setVisibleLogicalRange({ from, to });
      selectionRef.current = selection;
    }
  }, [selectedCandles, selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    chart.applyOptions({
      rightPriceScale: {
        autoScale: true
      }
    });
  }, [selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== "r") {
        return;
      }

      event.preventDefault();

      const chart = chartRef.current;

      if (!chart || selectedCandles.length === 0) {
        return;
      }

      const to = selectedCandles.length - 1;
      const from = Math.max(0, to - timeframeVisibleCount[selectedTimeframe]);
      chart.timeScale().setVisibleLogicalRange({ from, to });
      focusTradeIdRef.current = null;
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedCandles, selectedTimeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const pendingTradeId = focusTradeIdRef.current;

    if (
      !chart ||
      !pendingTradeId ||
      !selectedHistoryTrade ||
      selectedHistoryTrade.id !== pendingTradeId ||
      selectedHistoryTrade.symbol !== selectedSymbol
    ) {
      return;
    }

    const entryIndex = candleIndexByUnix.get(selectedHistoryTrade.entryTime) ?? -1;
    const exitIndexRaw = candleIndexByUnix.get(selectedHistoryTrade.exitTime) ?? -1;
    const exitIndex = exitIndexRaw >= 0 ? exitIndexRaw : entryIndex + 1;

    if (entryIndex < 0) {
      return;
    }

    const leftBound = Math.min(entryIndex, exitIndex);
    const rightBound = Math.max(entryIndex, exitIndex);
    const span = Math.max(32, Math.round(timeframeVisibleCount[selectedTimeframe] * 0.72));
    const from = Math.max(0, leftBound - Math.round(span * 0.4));
    const to = Math.min(selectedCandles.length - 1, rightBound + Math.round(span * 0.6));
    chart.timeScale().setVisibleLogicalRange({ from, to });
    focusTradeIdRef.current = null;
  }, [candleIndexByUnix, selectedCandles, selectedHistoryTrade, selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;

    if (!chart || !container || selectedSurfaceTab !== "chart") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      chart.applyOptions({
        width: Math.floor(container.clientWidth),
        height: Math.floor(container.clientHeight)
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [panelExpanded, activePanelTab, selectedSurfaceTab]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const tradeProfitZone = tradeProfitZoneRef.current;
    const tradeLossZone = tradeLossZoneRef.current;
    const tradeEntryLine = tradeEntryLineRef.current;
    const tradeTargetLine = tradeTargetLineRef.current;
    const tradeStopLine = tradeStopLineRef.current;
    const tradePathLine = tradePathLineRef.current;

    if (
      !chart ||
      !candleSeries ||
      !tradeProfitZone ||
      !tradeLossZone ||
      !tradeEntryLine ||
      !tradeTargetLine ||
      !tradeStopLine ||
      !tradePathLine
    ) {
      return;
    }

    const clearMultiTradeOverlays = () => {
      if (multiTradeSeriesRef.current.length === 0) {
        return;
      }

      for (const seriesGroup of multiTradeSeriesRef.current) {
        chart.removeSeries(seriesGroup.profitZone);
        chart.removeSeries(seriesGroup.lossZone);
        chart.removeSeries(seriesGroup.entryLine);
        chart.removeSeries(seriesGroup.targetLine);
        chart.removeSeries(seriesGroup.stopLine);
        chart.removeSeries(seriesGroup.pathLine);
      }

      multiTradeSeriesRef.current = [];
    };

    const clearTradeOverlays = () => {
      clearMultiTradeOverlays();
      candleSeries.setMarkers([]);
      tradeProfitZone.setData([]);
      tradeLossZone.setData([]);
      tradeEntryLine.setData([]);
      tradeTargetLine.setData([]);
      tradeStopLine.setData([]);
      tradePathLine.setData([]);
    };

    const applyTradeZonePaletteTo = (
      profitZoneSeries: ISeriesApi<"Baseline">,
      lossZoneSeries: ISeriesApi<"Baseline">,
      side: TradeSide,
      entryPrice: number,
      intense = true
    ) => {
      const greenStrong = intense ? "rgba(53, 201, 113, 0.22)" : "rgba(53, 201, 113, 0.14)";
      const greenSoft = intense ? "rgba(53, 201, 113, 0.05)" : "rgba(53, 201, 113, 0.03)";
      const redStrong = intense ? "rgba(240, 69, 90, 0.24)" : "rgba(240, 69, 90, 0.14)";
      const redSoft = intense ? "rgba(240, 69, 90, 0.07)" : "rgba(240, 69, 90, 0.03)";

      if (side === "Long") {
        profitZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: greenStrong,
          topFillColor2: greenSoft,
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: "rgba(0,0,0,0)",
          bottomFillColor2: "rgba(0,0,0,0)"
        });
        lossZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: "rgba(0,0,0,0)",
          topFillColor2: "rgba(0,0,0,0)",
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: redStrong,
          bottomFillColor2: redSoft
        });
      } else {
        profitZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: redStrong,
          topFillColor2: redSoft,
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: "rgba(0,0,0,0)",
          bottomFillColor2: "rgba(0,0,0,0)"
        });
        lossZoneSeries.applyOptions({
          baseValue: { type: "price", price: entryPrice },
          topLineColor: "rgba(0,0,0,0)",
          topFillColor1: "rgba(0,0,0,0)",
          topFillColor2: "rgba(0,0,0,0)",
          bottomLineColor: "rgba(0,0,0,0)",
          bottomFillColor1: greenStrong,
          bottomFillColor2: greenSoft
        });
      }
    };

    const applyTradeZonePalette = (side: TradeSide, entryPrice: number) => {
      applyTradeZonePaletteTo(tradeProfitZone, tradeLossZone, side, entryPrice, true);
    };

    const createMultiTradeSeries = (): MultiTradeOverlaySeries => {
      const entryLine = chart.addLineSeries({
        color: "rgba(232, 238, 250, 0.62)",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const targetLine = chart.addLineSeries({
        color: "rgba(53, 201, 113, 0.7)",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const stopLine = chart.addLineSeries({
        color: "rgba(255, 76, 104, 0.7)",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const pathLine = chart.addLineSeries({
        color: "rgba(220, 230, 248, 0.64)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const profitZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(53, 201, 113, 0.14)",
        topFillColor2: "rgba(53, 201, 113, 0.03)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(0,0,0,0)",
        bottomFillColor2: "rgba(0,0,0,0)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const lossZone = chart.addBaselineSeries({
        baseValue: { type: "price", price: 0 },
        topLineColor: "rgba(0,0,0,0)",
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        bottomLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: "rgba(240, 69, 90, 0.14)",
        bottomFillColor2: "rgba(240, 69, 90, 0.03)",
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });

      return {
        profitZone,
        lossZone,
        entryLine,
        targetLine,
        stopLine,
        pathLine
      };
    };

    const renderSingleTrade = (trade: {
      side: TradeSide;
      status: "closed" | "pending";
      result: TradeResult;
      entryTime: UTCTimestamp;
      exitTime: UTCTimestamp;
      entryPrice: number;
      targetPrice: number;
      stopPrice: number;
      outcomePrice: number;
      pnlUsd: number;
    }) => {
      const startTime = trade.entryTime;
      const endTime =
        trade.exitTime > trade.entryTime
          ? trade.exitTime
          : ((trade.entryTime + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp);
      const entryAction = trade.side === "Long" ? "Buy" : "Sell";
      const tradeZoneData = [
        { time: startTime, value: trade.targetPrice },
        { time: endTime, value: trade.targetPrice }
      ];
      const stopZoneData = [
        { time: startTime, value: trade.stopPrice },
        { time: endTime, value: trade.stopPrice }
      ];
      const derivedResult: TradeResult =
        trade.status === "pending" ? (trade.pnlUsd >= 0 ? "Win" : "Loss") : trade.result;
      const exitPrefix = derivedResult === "Win" ? "✓" : "x";
      const exitPosition = getExitMarkerPosition(trade.side, derivedResult);
      clearMultiTradeOverlays();

      candleSeries.setMarkers([
        {
          time: startTime,
          position: trade.side === "Long" ? "belowBar" : "aboveBar",
          shape: trade.side === "Long" ? "arrowUp" : "arrowDown",
          color: trade.side === "Long" ? "#30b76f" : "#f0455a",
          text: entryAction
        },
        {
          time: endTime,
          position: exitPosition,
          shape: "square",
          color: derivedResult === "Win" ? "#35c971" : "#f0455a",
          text: `${exitPrefix} ${formatSignedUsd(trade.pnlUsd)}`
        }
      ]);

      applyTradeZonePalette(trade.side, trade.entryPrice);
      tradeEntryLine.setData([
        { time: startTime, value: trade.entryPrice },
        { time: endTime, value: trade.entryPrice }
      ]);
      tradeTargetLine.setData(tradeZoneData);
      tradeStopLine.setData(stopZoneData);
      tradePathLine.setData([
        { time: startTime, value: trade.entryPrice },
        { time: endTime, value: trade.outcomePrice }
      ]);

      if (trade.side === "Long") {
        tradeProfitZone.setData(tradeZoneData);
        tradeLossZone.setData(stopZoneData);
      } else {
        tradeProfitZone.setData(stopZoneData);
        tradeLossZone.setData(tradeZoneData);
      }
    };

    if (showAllTradesOnChart) {
      clearMultiTradeOverlays();
      tradeProfitZone.setData([]);
      tradeLossZone.setData([]);
      tradeEntryLine.setData([]);
      tradeTargetLine.setData([]);
      tradeStopLine.setData([]);
      tradePathLine.setData([]);

      if (currentSymbolHistoryRows.length === 0) {
        candleSeries.setMarkers([]);
        return;
      }

      const allMarkers: SeriesMarker<Time>[] = [];

      for (const trade of currentSymbolHistoryRows) {
        const tradeResult: TradeResult = trade.result;
        const endTime =
          trade.exitTime > trade.entryTime
            ? trade.exitTime
            : ((trade.entryTime + timeframeMinutes[selectedTimeframe] * 60) as UTCTimestamp);
        const targetData = [
          { time: trade.entryTime, value: trade.targetPrice },
          { time: endTime, value: trade.targetPrice }
        ];
        const stopData = [
          { time: trade.entryTime, value: trade.stopPrice },
          { time: endTime, value: trade.stopPrice }
        ];
        const seriesGroup = createMultiTradeSeries();

        applyTradeZonePaletteTo(
          seriesGroup.profitZone,
          seriesGroup.lossZone,
          trade.side,
          trade.entryPrice,
          false
        );
        seriesGroup.entryLine.setData([
          { time: trade.entryTime, value: trade.entryPrice },
          { time: endTime, value: trade.entryPrice }
        ]);
        seriesGroup.targetLine.setData(targetData);
        seriesGroup.stopLine.setData(stopData);
        seriesGroup.pathLine.setData([
          { time: trade.entryTime, value: trade.entryPrice },
          { time: endTime, value: trade.outcomePrice }
        ]);

        if (trade.side === "Long") {
          seriesGroup.profitZone.setData(targetData);
          seriesGroup.lossZone.setData(stopData);
        } else {
          seriesGroup.profitZone.setData(stopData);
          seriesGroup.lossZone.setData(targetData);
        }

        multiTradeSeriesRef.current.push(seriesGroup);

        allMarkers.push({
          time: trade.entryTime,
          position: trade.side === "Long" ? "belowBar" : "aboveBar",
          shape: trade.side === "Long" ? "arrowUp" : "arrowDown",
          color: trade.side === "Long" ? "#35c971" : "#f0455a",
          text: trade.side === "Long" ? "Buy" : "Sell"
        });
        allMarkers.push({
          time: endTime,
          position: getExitMarkerPosition(trade.side, tradeResult),
          shape: "square",
          color: tradeResult === "Win" ? "#35c971" : "#f0455a",
          text: `${tradeResult === "Win" ? "✓" : "x"} ${formatSignedUsd(trade.pnlUsd)}`
        });
      }

      allMarkers.sort((a, b) => Number(a.time) - Number(b.time));
      candleSeries.setMarkers(allMarkers);
      return;
    }

    if (showActiveTradeOnChart && activeChartTrade && activeChartTrade.symbol === selectedSymbol) {
      renderSingleTrade({
        side: activeChartTrade.side,
        status: activeChartTrade.status,
        result: activeChartTrade.result,
        entryTime: activeChartTrade.entryTime,
        exitTime: activeChartTrade.exitTime,
        entryPrice: activeChartTrade.entryPrice,
        targetPrice: activeChartTrade.targetPrice,
        stopPrice: activeChartTrade.stopPrice,
        outcomePrice: activeChartTrade.outcomePrice,
        pnlUsd: activeChartTrade.pnlUsd
      });
      return;
    }

    if (!selectedHistoryTrade || selectedHistoryTrade.symbol !== selectedSymbol) {
      clearTradeOverlays();
      return;
    }

    renderSingleTrade({
      side: selectedHistoryTrade.side,
      status: "closed",
      result: selectedHistoryTrade.result,
      entryTime: selectedHistoryTrade.entryTime,
      exitTime: selectedHistoryTrade.exitTime,
      entryPrice: selectedHistoryTrade.entryPrice,
      targetPrice: selectedHistoryTrade.targetPrice,
      stopPrice: selectedHistoryTrade.stopPrice,
      outcomePrice: selectedHistoryTrade.outcomePrice,
      pnlUsd: selectedHistoryTrade.pnlUsd
    });
  }, [
    activeChartTrade,
    currentSymbolHistoryRows,
    selectedHistoryTrade,
    selectedSymbol,
    selectedTimeframe,
    showActiveTradeOnChart,
    showAllTradesOnChart
  ]);

  const backtestSourceTrades = useMemo(() => {
    return [...historyRows].sort((a, b) => Number(a.exitTime) - Number(b.exitTime));
  }, [historyRows]);

  const backtestTrades = useMemo(() => {
    return backtestSourceTrades.filter((trade) => {
      const weekday = getWeekdayLabel(getTradeDayKey(trade.exitTime));
      const session = getSessionLabel(trade.entryTime);
      const monthIndex = getTradeMonthIndex(trade.exitTime);
      const entryHour = getTradeHour(trade.entryTime);
      const passesTime =
        enabledBacktestWeekdays.includes(weekday) &&
        enabledBacktestSessions.includes(session) &&
        enabledBacktestMonths.includes(monthIndex) &&
        enabledBacktestHours.includes(entryHour);
      const confidence = getTradeConfidenceScore(trade) * 100;
      const passesConfidence = !aiFilterEnabled || confidence >= confidenceThreshold;

      return passesTime && passesConfidence;
    });
  }, [
    aiFilterEnabled,
    backtestSourceTrades,
    confidenceThreshold,
    enabledBacktestHours,
    enabledBacktestMonths,
    enabledBacktestSessions,
    enabledBacktestWeekdays
  ]);

  const backtestSummary = useMemo(() => {
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

    for (const trade of backtestTrades) {
      const holdMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
      const targetPotentialUsd =
        Math.abs(trade.targetPrice - trade.entryPrice) * Math.max(1, trade.units);
      const stopPotentialUsd =
        Math.abs(trade.entryPrice - trade.stopPrice) * Math.max(1, trade.units);
      const favorableShare = trade.result === "Win" ? 0.68 : 0.32;
      netPnl += trade.pnlUsd;
      runningPnl += trade.pnlUsd;
      peakPnl = Math.max(peakPnl, runningPnl);
      maxDrawdown = Math.min(maxDrawdown, runningPnl - peakPnl);
      maxWin = Math.max(maxWin, trade.pnlUsd);
      maxLoss = Math.min(maxLoss, trade.pnlUsd);
      totalHoldMinutes += holdMinutes;
      totalConfidence += getTradeConfidenceScore(trade) * 100;
      estimatedPeakTotal += Math.max(Math.max(trade.pnlUsd, 0), targetPotentialUsd);
      estimatedDrawdownTotal += Math.max(Math.abs(Math.min(trade.pnlUsd, 0)), stopPotentialUsd);
      estimatedProfitMinutes += holdMinutes * favorableShare;
      estimatedDeficitMinutes += holdMinutes * (1 - favorableShare);
      pnlSeries.push(trade.pnlUsd);

      if (trade.pnlUsd >= 0) {
        grossWins += trade.pnlUsd;
        totalWinHoldMinutes += holdMinutes;
      } else {
        grossLosses += trade.pnlUsd;
        losses += 1;
        totalLossHoldMinutes += holdMinutes;
      }

      if (trade.result === "Win") {
        wins += 1;
      }

      const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
      const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
      totalR += rewardDistance / riskDistance;

      const dayKey = getTradeDayKey(trade.exitTime);
      const currentDay = dayMap.get(dayKey) ?? { key: dayKey, count: 0, pnl: 0 };
      currentDay.count += 1;
      currentDay.pnl += trade.pnlUsd;
      dayMap.set(dayKey, currentDay);

      const weekKey = getTradeWeekKey(trade.exitTime);
      const currentWeek = weekMap.get(weekKey) ?? { key: weekKey, count: 0, pnl: 0 };
      currentWeek.count += 1;
      currentWeek.pnl += trade.pnlUsd;
      weekMap.set(weekKey, currentWeek);

      const monthKey = getTradeMonthKey(trade.exitTime);
      const currentMonth = monthMap.get(monthKey) ?? { key: monthKey, count: 0, pnl: 0 };
      currentMonth.count += 1;
      currentMonth.pnl += trade.pnlUsd;
      monthMap.set(monthKey, currentMonth);
    }

    const dayRows = Array.from(dayMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const weekRows = Array.from(weekMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const monthRows = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const bestDay = [...dayRows].sort((a, b) => b.pnl - a.pnl)[0] ?? null;
    const worstDay = [...dayRows].sort((a, b) => a.pnl - b.pnl)[0] ?? null;
    const tradeCount = backtestTrades.length;
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
    const positiveDays = dayRows.filter((row) => row.pnl >= 0).length;
    const positiveWeeks = weekRows.filter((row) => row.pnl >= 0).length;
    const positiveMonths = monthRows.filter((row) => row.pnl >= 0).length;
    const sharpe = stdDev > 0 ? mean / stdDev : 0;
    const sortino = downsideDeviation > 0 ? mean / downsideDeviation : 0;

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
      tradesPerDay: dayRows.length > 0 ? tradeCount / dayRows.length : 0,
      tradesPerWeek: weekRows.length > 0 ? tradeCount / weekRows.length : 0,
      tradesPerMonth: monthRows.length > 0 ? tradeCount / monthRows.length : 0,
      consistencyPerDay: dayRows.length > 0 ? (positiveDays / dayRows.length) * 100 : 0,
      consistencyPerWeek: weekRows.length > 0 ? (positiveWeeks / weekRows.length) * 100 : 0,
      consistencyPerMonth: monthRows.length > 0 ? (positiveMonths / monthRows.length) * 100 : 0,
      consistencyPerTrade: tradeCount > 0 ? (wins / tradeCount) * 100 : 0,
      avgPnlPerDay: dayRows.length > 0 ? netPnl / dayRows.length : 0,
      avgPnlPerWeek: weekRows.length > 0 ? netPnl / weekRows.length : 0,
      avgPnlPerMonth: monthRows.length > 0 ? netPnl / monthRows.length : 0,
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
  }, [backtestTrades]);

  const mainStatisticsCards = useMemo(() => {
    return [
      {
        label: "Total PnL",
        value: formatSignedUsd(backtestSummary.totalPnl),
        tone: backtestSummary.totalPnl >= 0 ? "up" : "down",
        span: 4
      },
      {
        label: "Win Rate",
        value: `${backtestSummary.winRate.toFixed(2)}%`,
        tone: backtestSummary.winRate >= 55 ? "up" : backtestSummary.winRate >= 45 ? "neutral" : "down",
        span: 2
      },
      {
        label: "Profit Factor",
        value: backtestSummary.profitFactor.toFixed(2),
        tone:
          backtestSummary.profitFactor > 1.5
            ? "up"
            : backtestSummary.profitFactor >= 1
              ? "neutral"
              : "down",
        span: 2
      },
      {
        label: "Total Trades",
        value: backtestSummary.tradeCount.toLocaleString("en-US"),
        tone: "neutral",
        span: 4
      },
      {
        label: "Trades per Month",
        value: backtestSummary.tradesPerMonth.toFixed(2),
        tone: "neutral",
        span: 1
      },
      {
        label: "Trades per Week",
        value: backtestSummary.tradesPerWeek.toFixed(2),
        tone: "neutral",
        span: 1
      },
      {
        label: "Trades per Day",
        value: backtestSummary.tradesPerDay.toFixed(2),
        tone: "neutral",
        span: 1
      },
      {
        label: "Average Confidence",
        value: `${backtestSummary.averageConfidence.toFixed(1)}%`,
        tone: "neutral",
        span: 1
      },
      {
        label: "Consistency / Month",
        value: `${backtestSummary.consistencyPerMonth.toFixed(1)}%`,
        tone:
          backtestSummary.consistencyPerMonth >= 70
            ? "up"
            : backtestSummary.consistencyPerMonth >= 50
              ? "neutral"
              : "down",
        span: 1
      },
      {
        label: "Consistency / Week",
        value: `${backtestSummary.consistencyPerWeek.toFixed(1)}%`,
        tone:
          backtestSummary.consistencyPerWeek >= 70
            ? "up"
            : backtestSummary.consistencyPerWeek >= 50
              ? "neutral"
              : "down",
        span: 1
      },
      {
        label: "Consistency / Day",
        value: `${backtestSummary.consistencyPerDay.toFixed(1)}%`,
        tone:
          backtestSummary.consistencyPerDay >= 70
            ? "up"
            : backtestSummary.consistencyPerDay >= 50
              ? "neutral"
              : "down",
        span: 1
      },
      {
        label: "Consistency / Trade",
        value: `${backtestSummary.consistencyPerTrade.toFixed(1)}%`,
        tone:
          backtestSummary.consistencyPerTrade >= 70
            ? "up"
            : backtestSummary.consistencyPerTrade >= 50
              ? "neutral"
              : "down",
        span: 1
      },
      {
        label: "Avg PnL / Month",
        value: formatSignedUsd(backtestSummary.avgPnlPerMonth),
        tone: backtestSummary.avgPnlPerMonth >= 0 ? "up" : "down",
        span: 1
      },
      {
        label: "Avg PnL / Week",
        value: formatSignedUsd(backtestSummary.avgPnlPerWeek),
        tone: backtestSummary.avgPnlPerWeek >= 0 ? "up" : "down",
        span: 1
      },
      {
        label: "Avg PnL / Day",
        value: formatSignedUsd(backtestSummary.avgPnlPerDay),
        tone: backtestSummary.avgPnlPerDay >= 0 ? "up" : "down",
        span: 1
      },
      {
        label: "Expected Value",
        value: formatSignedUsd(backtestSummary.avgPnl),
        tone: backtestSummary.avgPnl >= 0 ? "up" : "down",
        span: 1
      },
      {
        label: "Sharpe",
        value: backtestSummary.sharpe.toFixed(2),
        tone: backtestSummary.sharpe >= 1 ? "up" : backtestSummary.sharpe >= 0 ? "neutral" : "down",
        span: 1
      },
      {
        label: "Sortino",
        value: backtestSummary.sortino.toFixed(2),
        tone:
          backtestSummary.sortino >= 1
            ? "up"
            : backtestSummary.sortino >= 0
              ? "neutral"
              : "down",
        span: 1
      },
      {
        label: "Risk to Reward",
        value: backtestSummary.avgR.toFixed(2),
        tone: backtestSummary.avgR >= 1 ? "up" : "down",
        span: 1
      },
      {
        label: "Biggest Win",
        value: `+$${formatUsd(backtestSummary.maxWin)}`,
        tone: "up",
        span: 1
      },
      {
        label: "Biggest Loss",
        value: `-$${formatUsd(Math.abs(backtestSummary.maxLoss))}`,
        tone: "down",
        span: 1
      },
      {
        label: "Average Peak / Trade",
        value: `+$${formatUsd(backtestSummary.avgPeakPerTrade)}`,
        tone: "up",
        span: 1
      },
      {
        label: "Avg Max Drawdown / Trade",
        value: `-$${formatUsd(backtestSummary.avgMaxDrawdownPerTrade)}`,
        tone: "down",
        span: 1
      },
      {
        label: "Average Win",
        value: `+$${formatUsd(backtestSummary.avgWin)}`,
        tone: "up",
        span: 2
      },
      {
        label: "Average Loss",
        value: `-$${formatUsd(Math.abs(backtestSummary.avgLoss))}`,
        tone: "down",
        span: 2
      },
      {
        label: "Average Win Duration",
        value: formatMinutesCompact(backtestSummary.avgWinDurationMin),
        tone: "up",
        span: 1
      },
      {
        label: "Average Loss Duration",
        value: formatMinutesCompact(backtestSummary.avgLossDurationMin),
        tone: "down",
        span: 1
      },
      {
        label: "Average Time in Profit",
        value: formatMinutesCompact(backtestSummary.avgTimeInProfitMin),
        tone: "up",
        span: 1
      },
      {
        label: "Average Time in Deficit",
        value: formatMinutesCompact(backtestSummary.avgTimeInDeficitMin),
        tone: "down",
        span: 1
      }
    ];
  }, [backtestSummary]);

  const availableBacktestMonths = useMemo(() => {
    const monthKeys = new Set<string>();

    for (const trade of backtestTrades) {
      monthKeys.add(getTradeMonthKey(trade.exitTime));
    }

    return Array.from(monthKeys).sort((a, b) => b.localeCompare(a));
  }, [backtestTrades]);

  const backtestCalendarAgg = useMemo(() => {
    const map = new Map<string, { count: number; wins: number; pnl: number; items: HistoryItem[] }>();

    for (const trade of backtestTrades) {
      const dateKey = getTradeDayKey(trade.exitTime);
      const bucket = map.get(dateKey) ?? { count: 0, wins: 0, pnl: 0, items: [] };
      bucket.count += 1;
      bucket.wins += trade.result === "Win" ? 1 : 0;
      bucket.pnl += trade.pnlUsd;
      bucket.items.push(trade);
      map.set(dateKey, bucket);
    }

    return map;
  }, [backtestTrades]);

  const selectedBacktestMonthIndex = selectedBacktestMonthKey
    ? availableBacktestMonths.indexOf(selectedBacktestMonthKey)
    : -1;

  const calendarMonthLabel = selectedBacktestMonthKey
    ? getMonthLabel(selectedBacktestMonthKey)
    : "No trades loaded";

  const backtestCalendarGrid = useMemo(() => {
    if (!selectedBacktestMonthKey) {
      return [] as Array<{
        dateKey: string;
        day: number;
        inMonth: boolean;
        activity: { count: number; wins: number; pnl: number; items: HistoryItem[] } | null;
      }>;
    }

    const [year, month] = selectedBacktestMonthKey.split("-").map((value) => Number(value));

    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return [];
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const offset = monthStart.getUTCDay();
    const gridStart = new Date(Date.UTC(year, month - 1, 1 - offset));

    return Array.from({ length: 42 }, (_, index) => {
      const current = new Date(gridStart.getTime() + index * 86_400_000);
      const dateKey = current.toISOString().slice(0, 10);

      return {
        dateKey,
        day: current.getUTCDate(),
        inMonth: current.getUTCMonth() === monthStart.getUTCMonth(),
        activity: backtestCalendarAgg.get(dateKey) ?? null
      };
    });
  }, [backtestCalendarAgg, selectedBacktestMonthKey]);

  const selectedBacktestMonthPnl = useMemo(() => {
    return backtestCalendarGrid.reduce((sum, cell) => {
      if (!cell.inMonth || !cell.activity) {
        return sum;
      }

      return sum + cell.activity.pnl;
    }, 0);
  }, [backtestCalendarGrid]);

  const visibleBacktestDateKeys = useMemo(() => {
    return backtestCalendarGrid
      .filter((cell) => cell.inMonth && cell.activity)
      .map((cell) => cell.dateKey);
  }, [backtestCalendarGrid]);

  const selectedBacktestDayTrades = useMemo(() => {
    const bucket = backtestCalendarAgg.get(selectedBacktestDateKey);

    if (!bucket) {
      return [];
    }

    return [...bucket.items].sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
  }, [backtestCalendarAgg, selectedBacktestDateKey]);

  const filteredBacktestHistory = useMemo(() => {
    const query = backtestHistoryQuery.trim().toLowerCase();

    if (!query) {
      return [...backtestTrades].sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
    }

    return [...backtestTrades]
      .filter((trade) => {
        const haystack = [
          trade.symbol,
          trade.side,
          trade.result,
          trade.entryAt,
          trade.exitAt,
          formatSignedUsd(trade.pnlUsd),
          formatSignedPercent(trade.pnlPct)
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) => Number(b.exitTime) - Number(a.exitTime));
  }, [backtestHistoryQuery, backtestTrades]);

  const backtestTemporalStats = useMemo(() => {
    const weekdayRows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => ({
      label,
      count: 0,
      wins: 0,
      pnl: 0
    }));
    const monthRows = backtestMonthLabels.map((label) => ({
      label,
      count: 0,
      wins: 0,
      pnl: 0
    }));
    const hourRows = backtestHourLabels.map((label, hour) => ({
      label,
      hour,
      count: 0,
      wins: 0,
      pnl: 0
    }));
    const sessionLabels = ["Asia", "London", "New York", "Late"];
    const sessionMap = new Map<string, { label: string; count: number; wins: number; pnl: number }>();

    for (const label of sessionLabels) {
      sessionMap.set(label, { label, count: 0, wins: 0, pnl: 0 });
    }

    for (const trade of backtestTrades) {
      const date = new Date(Number(trade.exitTime) * 1000);
      const weekday = weekdayRows[date.getUTCDay()];
      const monthRow = monthRows[date.getUTCMonth()];
      const hourRow = hourRows[getTradeHour(trade.entryTime)];
      weekday.count += 1;
      weekday.wins += trade.result === "Win" ? 1 : 0;
      weekday.pnl += trade.pnlUsd;
      monthRow.count += 1;
      monthRow.wins += trade.result === "Win" ? 1 : 0;
      monthRow.pnl += trade.pnlUsd;
      hourRow.count += 1;
      hourRow.wins += trade.result === "Win" ? 1 : 0;
      hourRow.pnl += trade.pnlUsd;

      const session = sessionMap.get(getSessionLabel(trade.entryTime));

      if (session) {
        session.count += 1;
        session.wins += trade.result === "Win" ? 1 : 0;
        session.pnl += trade.pnlUsd;
      }
    }

    const sessions = Array.from(sessionMap.values());

    return {
      weekdays: weekdayRows.map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      })),
      months: monthRows.map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      })),
      hours: hourRows.map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      })),
      sessions: sessions.map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      }))
    };
  }, [backtestTrades]);

  const backtestEntryExitStats = useMemo(() => {
    const sideMap = new Map<TradeSide, { side: TradeSide; count: number; wins: number; pnl: number }>();
    const exitMap = new Map<string, number>([
      ["Target Hit", 0],
      ["Protective Stop", 0],
      ["Managed Exit", 0]
    ]);
    let totalEntry = 0;
    let totalExit = 0;
    let totalStopDistance = 0;
    let totalTargetDistance = 0;
    let totalUnits = 0;
    let totalHoldMinutes = 0;

    sideMap.set("Long", { side: "Long", count: 0, wins: 0, pnl: 0 });
    sideMap.set("Short", { side: "Short", count: 0, wins: 0, pnl: 0 });

    for (const trade of backtestTrades) {
      totalEntry += trade.entryPrice;
      totalExit += trade.outcomePrice;
      totalStopDistance += Math.abs(trade.entryPrice - trade.stopPrice);
      totalTargetDistance += Math.abs(trade.targetPrice - trade.entryPrice);
      totalUnits += trade.units;
      totalHoldMinutes += Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);

      const side = sideMap.get(trade.side);

      if (side) {
        side.count += 1;
        side.wins += trade.result === "Win" ? 1 : 0;
        side.pnl += trade.pnlUsd;
      }

      const targetGap = Math.abs(trade.targetPrice - trade.entryPrice);
      const stopGap = Math.abs(trade.entryPrice - trade.stopPrice);
      const realizedGap = Math.abs(trade.outcomePrice - trade.entryPrice);
      const exitLabel =
        trade.result === "Win" && realizedGap >= targetGap * 0.84
          ? "Target Hit"
          : trade.result === "Loss" && realizedGap >= stopGap * 0.84
            ? "Protective Stop"
            : "Managed Exit";

      exitMap.set(exitLabel, (exitMap.get(exitLabel) ?? 0) + 1);
    }

    const count = backtestTrades.length;

    return {
      avgEntry: count > 0 ? totalEntry / count : 0,
      avgExit: count > 0 ? totalExit / count : 0,
      avgStopDistance: count > 0 ? totalStopDistance / count : 0,
      avgTargetDistance: count > 0 ? totalTargetDistance / count : 0,
      avgUnits: count > 0 ? totalUnits / count : 0,
      avgHoldMinutes: count > 0 ? totalHoldMinutes / count : 0,
      sides: Array.from(sideMap.values()).map((row) => ({
        ...row,
        winRate: row.count > 0 ? (row.wins / row.count) * 100 : 0
      })),
      exits: Array.from(exitMap.entries()).map(([label, value]) => ({
        label,
        value,
        pct: count > 0 ? (value / count) * 100 : 0
      }))
    };
  }, [backtestTrades]);

  const backtestClusterData = useMemo(() => {
    const holds = backtestTrades.map((trade) =>
      Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60)
    );
    const sortedHolds = [...holds].sort((a, b) => a - b);
    const medianHold =
      sortedHolds.length > 0 ? sortedHolds[Math.floor(sortedHolds.length / 2)] : 0;
    const maxHold = Math.max(1, ...holds);
    const maxUnits = Math.max(1, ...backtestTrades.map((trade) => trade.units));
    const maxAbsPnl = Math.max(1, ...backtestTrades.map((trade) => Math.abs(trade.pnlPct)));
    const clusterMeta = {
      momentum: {
        label: "Momentum",
        description: "Fast winners that resolve quickly with clean follow-through."
      },
      trend: {
        label: "Trend Hold",
        description: "Winners that need more time but keep directional conviction."
      },
      trap: {
        label: "Trap",
        description: "Losses that extend before the move fully invalidates."
      },
      chop: {
        label: "Chop",
        description: "Short-lived noise trades with shallow edge."
      }
    } as const;
    const groupMap = new Map<
      keyof typeof clusterMeta,
      {
        id: keyof typeof clusterMeta;
        label: string;
        description: string;
        count: number;
        wins: number;
        pnl: number;
      }
    >();

    const nodes = backtestTrades.map((trade) => {
      const holdMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
      const clusterId: keyof typeof clusterMeta =
        trade.result === "Win"
          ? holdMinutes <= medianHold
            ? "momentum"
            : "trend"
          : Math.abs(trade.pnlPct) >= 0.22
            ? "trap"
            : "chop";
      const group =
        groupMap.get(clusterId) ??
        (() => {
          const meta = clusterMeta[clusterId];
          const next = {
            id: clusterId,
            label: meta.label,
            description: meta.description,
            count: 0,
            wins: 0,
            pnl: 0
          };
          groupMap.set(clusterId, next);
          return next;
        })();

      group.count += 1;
      group.wins += trade.result === "Win" ? 1 : 0;
      group.pnl += trade.pnlUsd;

      return {
        id: trade.id,
        clusterId,
        x: 11 + ((trade.pnlPct + maxAbsPnl) / (maxAbsPnl * 2)) * 78,
        y: 88 - (holdMinutes / maxHold) * 72,
        r: 3 + (trade.units / maxUnits) * 3.5,
        tone: trade.pnlUsd >= 0 ? "up" : "down"
      };
    });

    const groups = Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        winRate: group.count > 0 ? (group.wins / group.count) * 100 : 0,
        avgPnl: group.count > 0 ? group.pnl / group.count : 0
      }))
      .sort((a, b) => b.avgPnl - a.avgPnl);

    return { nodes, groups };
  }, [backtestTrades]);

  const backtestGraphData = useMemo(() => {
    const curve: number[] = [];
    const monthMap = new Map<string, number>();
    const buckets = [
      { label: "< -$80", min: Number.NEGATIVE_INFINITY, max: -80, count: 0 },
      { label: "-$80 to -$20", min: -80, max: -20, count: 0 },
      { label: "-$20 to +$20", min: -20, max: 20, count: 0 },
      { label: "+$20 to +$80", min: 20, max: 80, count: 0 },
      { label: "> +$80", min: 80, max: Number.POSITIVE_INFINITY, count: 0 }
    ];
    let running = 0;

    for (const trade of backtestTrades) {
      running += trade.pnlUsd;
      curve.push(running);
      const monthKey = getTradeMonthKey(trade.exitTime);
      monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + trade.pnlUsd);

      const bucket = buckets.find((item) => trade.pnlUsd >= item.min && trade.pnlUsd < item.max);

      if (bucket) {
        bucket.count += 1;
      }
    }

    const monthBars = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, value]) => ({
        key,
        label: key.slice(5),
        value
      }));

    return {
      curve,
      curvePath: buildSparklinePath(curve, 100, 28),
      monthBars,
      buckets
    };
  }, [backtestTrades]);

  const backtestDimensionRows = useMemo(() => {
    if (backtestTrades.length === 0) {
      return [] as Array<{ name: string; reading: string; note: string; score: number }>;
    }

    const bestSession =
      [...backtestTemporalStats.sessions].sort((a, b) => b.winRate - a.winRate)[0] ?? null;
    const longRow = backtestEntryExitStats.sides.find((row) => row.side === "Long");
    const longShare =
      longRow && backtestSummary.tradeCount > 0 ? longRow.count / backtestSummary.tradeCount : 0.5;
    const smoothness =
      1 -
      clamp(
        Math.abs(backtestSummary.maxDrawdown) /
          Math.max(Math.abs(backtestSummary.netPnl), Math.abs(backtestSummary.maxDrawdown), 1),
        0,
        1
      );

    return [
      {
        name: "Payoff Quality",
        reading: `${backtestSummary.avgR.toFixed(2)}R avg`,
        note: "Target distance versus stop distance",
        score: clamp(backtestSummary.avgR / 2.3, 0, 1)
      },
      {
        name: "Hit Rate Stability",
        reading: `${backtestSummary.winRate.toFixed(1)}% win rate`,
        note: "Win/loss balance on the current model and timeframe",
        score: clamp(backtestSummary.winRate / 100, 0, 1)
      },
      {
        name: "Execution Pace",
        reading: `${Math.round(backtestEntryExitStats.avgHoldMinutes)}m avg hold`,
        note: "How long the system stays in market before closing",
        score: 1 - clamp(backtestEntryExitStats.avgHoldMinutes / 480, 0, 1)
      },
      {
        name: "Directional Balance",
        reading: `${Math.round(longShare * 100)}% long exposure`,
        note: "Bias control between long and short simulations",
        score: 1 - Math.abs(longShare - 0.5) * 1.8
      },
      {
        name: "Session Alignment",
        reading: bestSession ? `${bestSession.label} leads` : "No session data",
        note: "Highest-conviction session in the current sample",
        score: bestSession ? clamp(bestSession.winRate / 100, 0, 1) : 0
      },
      {
        name: "Equity Smoothness",
        reading: `${formatSignedUsd(backtestSummary.maxDrawdown)} max pullback`,
        note: "How choppy the cumulative curve gets before recovering",
        score: clamp(smoothness, 0, 1)
      }
    ];
  }, [backtestEntryExitStats, backtestSummary, backtestTemporalStats.sessions, backtestTrades]);

  const filteredBacktestDimensionRows = useMemo(() => {
    const query = backtestDimensionQuery.trim().toLowerCase();

    if (!query) {
      return backtestDimensionRows;
    }

    return backtestDimensionRows.filter((row) => {
      const haystack = `${row.name} ${row.note} ${row.reading}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [backtestDimensionQuery, backtestDimensionRows]);

  const backtestEntryExitChartRows = useMemo(() => {
    if (entryExitChartMode === "entry") {
      return backtestTemporalStats.sessions.map((row) => ({
        key: row.label,
        label: row.label,
        count: row.count,
        tone: row.pnl >= 0 ? "up" : "down",
        detail: `${row.winRate.toFixed(0)}% win`,
        value: row.pnl
      }));
    }

    return backtestEntryExitStats.exits.map((row) => ({
      key: row.label,
      label: row.label,
      count: row.value,
      tone: "neutral" as const,
      detail: `${row.pct.toFixed(0)}% share`,
      value: row.pct
    }));
  }, [backtestEntryExitStats.exits, backtestTemporalStats.sessions, entryExitChartMode]);

  const backtestScatterPlot = useMemo(() => {
    const points = backtestTrades.map((trade) => {
      const x = getBacktestScatterValue(trade, scatterXKey);
      const y = getBacktestScatterValue(trade, scatterYKey);

      return {
        id: trade.id,
        trade,
        x,
        y
      };
    });

    if (points.length === 0) {
      return {
        points: [] as Array<{
          id: string;
          trade: HistoryItem;
          x: number;
          y: number;
          cx: number;
          cy: number;
        }>,
        xZero: null as number | null,
        yZero: null as number | null
      };
    }

    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    let xMin = Math.min(...xValues);
    let xMax = Math.max(...xValues);
    let yMin = Math.min(...yValues);
    let yMax = Math.max(...yValues);

    if (xMin === xMax) {
      xMin -= 1;
      xMax += 1;
    }

    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }

    const xPadding = (xMax - xMin) * 0.08;
    const yPadding = (yMax - yMin) * 0.08;
    xMin -= xPadding;
    xMax += xPadding;
    yMin -= yPadding;
    yMax += yPadding;

    const projectX = (value: number): number => 8 + ((value - xMin) / (xMax - xMin)) * 84;
    const projectY = (value: number): number => 92 - ((value - yMin) / (yMax - yMin)) * 84;
    const xZero = xMin <= 0 && xMax >= 0 ? projectX(0) : null;
    const yZero = yMin <= 0 && yMax >= 0 ? projectY(0) : null;

    return {
      points: points.map((point) => ({
        ...point,
        cx: projectX(point.x),
        cy: projectY(point.y)
      })),
      xZero,
      yZero
    };
  }, [backtestTrades, scatterXKey, scatterYKey]);

  const propFirmTradeSequence = useMemo(() => {
    if (propProjectionMethod === "historical") {
      return backtestTrades;
    }

    return [...backtestTrades].sort((left, right) => {
      const leftSeed = hashSeedFromText(`${selectedModelId}:${selectedTimeframe}:${left.id}`);
      const rightSeed = hashSeedFromText(`${selectedModelId}:${selectedTimeframe}:${right.id}`);
      return leftSeed - rightSeed;
    });
  }, [backtestTrades, propProjectionMethod, selectedModelId, selectedTimeframe]);

  const propFirmProjection = useMemo(() => {
    let balance = propInitialBalance;
    let peakBalance = propInitialBalance;
    let worstDrawdown = 0;
    let passedAtTrade = 0;
    let failedBy = "";
    const dayPnlMap = new Map<string, number>();
    const balanceCurve = [propInitialBalance];

    for (let index = 0; index < propFirmTradeSequence.length; index += 1) {
      const trade = propFirmTradeSequence[index];
      balance += trade.pnlUsd;
      balanceCurve.push(balance);
      peakBalance = Math.max(peakBalance, balance);
      worstDrawdown = Math.min(worstDrawdown, balance - peakBalance);

      const dayKey = getTradeDayKey(trade.exitTime);
      const dayPnl = (dayPnlMap.get(dayKey) ?? 0) + trade.pnlUsd;
      dayPnlMap.set(dayKey, dayPnl);

      if (!failedBy && dayPnl <= -Math.abs(propDailyMaxLoss)) {
        failedBy = `Daily loss breached on ${getCalendarDateLabel(dayKey)}`;
      }

      if (!failedBy && balance <= propInitialBalance - Math.abs(propTotalMaxLoss)) {
        failedBy = "Total drawdown limit breached";
      }

      if (
        !failedBy &&
        passedAtTrade === 0 &&
        balance >= propInitialBalance + Math.abs(propProfitTarget)
      ) {
        passedAtTrade = index + 1;
      }
    }

    const finalBalance = balance;
    const targetBalance = propInitialBalance + Math.abs(propProfitTarget);
    const status = failedBy ? "Failed" : passedAtTrade > 0 ? "Passed" : "In Progress";
    const remaining = Math.max(0, targetBalance - finalBalance);

    return {
      status,
      reason: failedBy || (passedAtTrade > 0 ? `Passed after ${passedAtTrade} trades` : "Target not reached yet"),
      finalBalance,
      targetBalance,
      remaining,
      progressPct:
        propProfitTarget === 0
          ? 100
          : clamp(((finalBalance - propInitialBalance) / Math.abs(propProfitTarget)) * 100, 0, 100),
      worstDrawdown,
      balanceCurve,
      balancePath: buildSparklinePath(balanceCurve, 100, 28),
      tradingDays: dayPnlMap.size
    };
  }, [
    propDailyMaxLoss,
    propFirmTradeSequence,
    propInitialBalance,
    propProfitTarget,
    propTotalMaxLoss
  ]);

  useEffect(() => {
    setSelectedBacktestMonthKey((current) => {
      if (availableBacktestMonths.length === 0) {
        return "";
      }

      return availableBacktestMonths.includes(current) ? current : availableBacktestMonths[0];
    });
  }, [availableBacktestMonths]);

  useEffect(() => {
    setSelectedBacktestDateKey((current) => {
      if (visibleBacktestDateKeys.length === 0) {
        return "";
      }

      return visibleBacktestDateKeys.includes(current) ? current : visibleBacktestDateKeys[0];
    });
  }, [visibleBacktestDateKeys]);

  return (
    <main className="terminal">
      <nav className="surface-strip" aria-label="primary views">
        {surfaceTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`surface-tab ${selectedSurfaceTab === tab.id ? "active" : ""}`}
            onClick={() => setSelectedSurfaceTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <header className="topbar">
        <div className="brand-area">
          <div className="asset-meta">
            <h1>{selectedAsset.symbol}</h1>
            <p>{selectedAsset.name}</p>
          </div>
          <div className="live-quote">
            {latestCandle ? (
              <>
                <span>${formatPrice(latestCandle.close)}</span>
                <span className={quoteChange >= 0 ? "up" : "down"}>
                  {quoteChange >= 0 ? "+" : ""}
                  {quoteChange.toFixed(2)}%
                </span>
              </>
            ) : (
              <span>No market data</span>
            )}
          </div>
        </div>

        <div className="top-controls">
          <nav className="timeframe-row" aria-label="timeframes">
            {timeframes.map((timeframe) => (
              <button
                key={timeframe}
                type="button"
                className={`timeframe ${timeframe === selectedTimeframe ? "active" : ""}`}
                onClick={() => setSelectedTimeframe(timeframe)}
              >
                {timeframe}
              </button>
            ))}
          </nav>
          <div className="top-utility">
            <span className="site-tag">korra.space</span>
            <div className="notif-wrap" ref={notificationRef}>
              <button
                type="button"
                className="notif-btn"
                aria-label="notifications"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <svg className="notif-icon" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M7 10.5a5 5 0 0 1 10 0v4.3l1.5 2.2H5.5L7 14.8v-4.3z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 19a2 2 0 0 0 4 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                {unreadNotificationCount > 0 ? (
                  <span className="notif-badge">{Math.min(9, unreadNotificationCount)}</span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div className="notif-popover">
                  <div className="notif-head">
                    <strong>Live Activity</strong>
                    <span>{notificationItems.length} events</span>
                  </div>
                  <ul className="notif-list">
                    {notificationItems.map((item) => (
                      <li key={item.id} className="notif-item">
                        <span className={`notif-dot ${item.tone}`} aria-hidden />
                        <div className="notif-copy">
                          <span className="notif-title">{item.title}</span>
                          <span className="notif-details">{item.details}</span>
                        </div>
                        <span className="notif-time">{item.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section className="surface-stage">
        <div className={`surface-view ${selectedSurfaceTab === "chart" ? "" : "hidden"}`}>
          <section className={`workspace ${panelExpanded ? "" : "panel-collapsed"}`}>
            <section className="chart-wrap">
              <div className="chart-toolbar">
                {hoveredCandle ? (
                  <>
                    <span>
                      O <strong>{formatPrice(hoveredCandle.open)}</strong>
                    </span>
                    <span>
                      H <strong>{formatPrice(hoveredCandle.high)}</strong>
                    </span>
                    <span>
                      L <strong>{formatPrice(hoveredCandle.low)}</strong>
                    </span>
                    <span>
                      C <strong>{formatPrice(hoveredCandle.close)}</strong>
                    </span>
                    <span className={hoveredChange >= 0 ? "up" : "down"}>
                      {hoveredChange >= 0 ? "+" : ""}
                      {hoveredChange.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <span>No market data loaded</span>
                )}
                <span>
                  Type <strong>{selectedAsset.funding}</strong>
                </span>
                <span>
                  Feed <strong>{selectedAsset.openInterest}</strong>
                </span>
                <span className="chart-hint">Scroll: zoom | Drag: pan | Opt+R: latest</span>
              </div>
              <div className="chart-stage">
                <div ref={chartContainerRef} className="tv-chart" aria-label="trading chart" />
              </div>
            </section>

            <aside className={`side-panel ${panelExpanded ? "expanded" : "collapsed"}`}>
              <nav className="panel-rail" aria-label="sidebar tabs">
                {sidebarTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rail-btn ${activePanelTab === tab.id ? "active" : ""}`}
                    onClick={() => {
                      if (panelExpanded && activePanelTab === tab.id) {
                        setPanelExpanded(false);
                        return;
                      }

                      setActivePanelTab(tab.id);
                      setPanelExpanded(true);
                    }}
                    title={tab.label}
                    aria-label={tab.label}
                  >
                    <TabIcon tab={tab.id} />
                  </button>
                ))}
              </nav>

              {panelExpanded ? (
                <div className="panel-content">
                  {activePanelTab === "active" ? (
                    <div className="tab-view active-tab">
                      <div className="watchlist-head with-action">
                        <div>
                          <h2>Active Trade</h2>
                          <p>Current open position · {selectedModel.name}</p>
                        </div>
                        <button
                          type="button"
                          className="panel-action-btn"
                          disabled={!activeTrade}
                          onClick={() => {
                            if (!activeTrade) {
                              return;
                            }

                            setSelectedSymbol(activeTrade.symbol);
                            setShowAllTradesOnChart(false);
                            setShowActiveTradeOnChart((current) => !current);
                            setSelectedHistoryId(null);
                            focusTradeIdRef.current = null;
                          }}
                        >
                          {showActiveTradeOnChart ? "Hide On Chart" : "Show On Chart"}
                        </button>
                      </div>

                      {activeTrade ? (
                        <div className="active-card">
                          <div className="active-card-top">
                            <div>
                              <span
                                className={`active-side ${
                                  activeTrade.side === "Long" ? "up" : "down"
                                }`}
                              >
                                {activeTrade.side}
                              </span>
                              <h3>{activeTrade.symbol}</h3>
                            </div>
                            <span className="active-live-tag">Live</span>
                          </div>

                          <div className="active-pnl">
                            <span>Unrealized PnL</span>
                            <strong className={activeTrade.pnlValue >= 0 ? "up" : "down"}>
                              {activeTrade.pnlValue >= 0 ? "+" : "-"}$
                              {formatUsd(Math.abs(activeTrade.pnlValue))}
                            </strong>
                            <small className={activeTrade.pnlPct >= 0 ? "up" : "down"}>
                              {activeTrade.pnlPct >= 0 ? "+" : ""}
                              {activeTrade.pnlPct.toFixed(2)}%
                            </small>
                          </div>

                          <div className="active-metrics-grid">
                            <div className="active-metric">
                              <span>Entry</span>
                              <strong>{formatPrice(activeTrade.entryPrice)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>Mark</span>
                              <strong>{formatPrice(activeTrade.markPrice)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>TP</span>
                              <strong className="up">{formatPrice(activeTrade.targetPrice)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>SL</span>
                              <strong className="down">{formatPrice(activeTrade.stopPrice)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>Size</span>
                              <strong>{formatUnits(activeTrade.units)} units</strong>
                            </div>
                            <div className="active-metric">
                              <span>R:R</span>
                              <strong>1:{activeTrade.rr.toFixed(2)}</strong>
                            </div>
                            <div className="active-metric">
                              <span>Opened</span>
                              <strong>{activeTrade.openedAtLabel}</strong>
                            </div>
                            <div className="active-metric">
                              <span>Duration</span>
                              <strong>{activeTrade.elapsed}</strong>
                            </div>
                          </div>

                          <div className="active-progress">
                            <div className="active-progress-head">
                              <span>Progress To TP</span>
                              <span>{activeTrade.progressPct.toFixed(1)}%</span>
                            </div>
                            <div className="active-progress-track">
                              <div
                                className="active-progress-fill"
                                style={{ width: `${activeTrade.progressPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="ai-placeholder">
                          <p>No active trade data yet.</p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {activePanelTab === "assets" ? (
                    <div className="tab-view">
                      <div className="watchlist-head">
                        <div>
                          <h2>XAUUSD</h2>
                          <p>OANDA history + market live feed</p>
                        </div>
                      </div>

                      <ul className="watchlist-body">
                        <li className="watchlist-labels" aria-hidden>
                          <span>Symbol</span>
                          <span>Last</span>
                          <span>Chg%</span>
                        </li>
                        {watchlistRows.map((row) => (
                          <li key={row.symbol}>
                            <button
                              type="button"
                              className={`watchlist-row ${
                                row.symbol === selectedSymbol ? "selected" : ""
                              }`}
                              onClick={() => setSelectedSymbol(row.symbol)}
                            >
                              <span className="symbol-col">
                                <span>{row.symbol}</span>
                                <small>{row.name}</small>
                              </span>

                              <span className="num-col">
                                {row.lastPrice === null ? "N/A" : formatPrice(row.lastPrice)}
                              </span>
                              <span
                                className={`num-col ${
                                  row.change === null ? "" : row.change >= 0 ? "up" : "down"
                                }`}
                              >
                                {row.change === null
                                  ? "N/A"
                                  : `${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}`}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {activePanelTab === "models" ? (
                    <div className="tab-view">
                      <div className="watchlist-head">
                        <div>
                          <h2>Models / People</h2>
                          <p>Select one profile to drive history and actions</p>
                        </div>
                      </div>
                      <ul className="model-list">
                        {modelProfiles.map((model) => {
                          const selected = model.id === selectedModelId;

                          return (
                            <li key={model.id}>
                              <button
                                type="button"
                                className={`model-row ${selected ? "selected" : ""}`}
                                onClick={() => setSelectedModelId(model.id)}
                              >
                                <span className="model-main">
                                  <span className="model-name">{model.name}</span>
                                  <span className="model-kind">{model.kind}</span>
                                </span>
                                {model.accountNumber ? (
                                  <span className="model-account">
                                    Korra Account #{model.accountNumber}
                                  </span>
                                ) : null}
                                <span className="model-state">
                                  {selected ? "Selected" : "Select"}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {activePanelTab === "mt5" ? (
                    <div className="tab-view copytrade-tab">
                      <div className="watchlist-head">
                        <div>
                          <h2>MT5 Copy Trade</h2>
                          <p>Connect an MT5 account to mirror {selectedModel.name}</p>
                        </div>
                      </div>
                      <div className="copytrade-body">
                        <div className="copytrade-source">
                          <span>Selected Source</span>
                          <strong>{selectedModel.name}</strong>
                          <small>
                            Pick the profile in Models / People, then enter the target MT5
                            account details here.
                          </small>
                        </div>

                        <div className="copytrade-form" aria-label="MT5 credentials form">
                          <label className="copytrade-field">
                            <span>MT5 Login</span>
                            <input
                              className="copytrade-input"
                              type="text"
                              name="mt5-login"
                              placeholder="Account number"
                              autoComplete="username"
                            />
                          </label>

                          <label className="copytrade-field">
                            <span>MT5 Password</span>
                            <input
                              className="copytrade-input"
                              type="password"
                              name="mt5-password"
                              placeholder="Password"
                              autoComplete="current-password"
                            />
                          </label>

                          <label className="copytrade-field">
                            <span>Server</span>
                            <input
                              className="copytrade-input"
                              type="text"
                              name="mt5-server"
                              placeholder="Broker server"
                              autoComplete="off"
                            />
                          </label>
                        </div>

                        <button type="button" className="panel-action-btn copytrade-submit" disabled>
                          Connect MT5
                        </button>

                        <p className="copytrade-note">
                          Placeholder only. Copy-trading logic and credential handling are not wired
                          yet.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {activePanelTab === "history" ? (
                    <div className="tab-view">
                      <div className="watchlist-head with-action">
                        <div>
                          <h2>History</h2>
                          <p>Simulated trade outcomes · {selectedModel.name}</p>
                        </div>
                        <button
                          type="button"
                          className="panel-action-btn"
                          onClick={() => {
                            const next = !showAllTradesOnChart;
                            setShowAllTradesOnChart(next);
                            setShowActiveTradeOnChart(false);
                            focusTradeIdRef.current = null;

                            if (next) {
                              setSelectedHistoryId(null);
                            }
                          }}
                        >
                          {showAllTradesOnChart ? "Hide All On Chart" : "Show All On Chart"}
                        </button>
                      </div>
                      <ul className="history-list">
                        {historyRows.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`history-row ${
                                selectedHistoryId === item.id ? "selected" : ""
                              }`}
                              onClick={() => {
                                focusTradeIdRef.current = item.id;
                                setSelectedHistoryId(item.id);
                                setSelectedSymbol(item.symbol);
                                setShowAllTradesOnChart(false);
                                setShowActiveTradeOnChart(false);
                              }}
                            >
                              <span className="history-info">
                                <span className="history-main">
                                  <span
                                    className={`history-action ${
                                      item.pnlUsd < 0 ? "down" : "up"
                                    }`}
                                  >
                                    {formatSignedUsd(item.pnlUsd)}
                                  </span>
                                  <span className="history-symbol">{item.symbol}</span>
                                </span>
                                <span className="history-levels">
                                  {item.side === "Long" ? "Buy" : "Sell"}{" "}
                                  {formatPrice(item.entryPrice)} | TP{" "}
                                  {formatPrice(item.targetPrice)} | SL{" "}
                                  {formatPrice(item.stopPrice)}
                                </span>
                              </span>
                              <span className="history-meta">
                                <span className={item.pnlPct < 0 ? "down" : "up"}>
                                  {item.pnlPct >= 0 ? "+" : ""}
                                  {item.pnlPct.toFixed(2)}%
                                </span>
                                <span>{item.time}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {activePanelTab === "actions" ? (
                    <div className="tab-view">
                      <div className="watchlist-head">
                        <div>
                          <h2>Action</h2>
                          <p>Entry, SL, TP, and exits · {selectedModel.name}</p>
                        </div>
                      </div>
                      <ul className="history-list">
                        {actionRows.map((action) => (
                          <li key={action.id}>
                            <button
                              type="button"
                              className={`history-row ${
                                selectedHistoryId === action.tradeId ? "selected" : ""
                              }`}
                              onClick={() => {
                                focusTradeIdRef.current = action.tradeId;
                                setSelectedHistoryId(action.tradeId);
                                setSelectedSymbol(action.symbol);
                                setShowAllTradesOnChart(false);
                                setShowActiveTradeOnChart(false);
                              }}
                            >
                              <span className="history-info">
                                <span className="history-main">
                                  <span className="history-action">{action.label}</span>
                                  <span className="history-symbol">{action.symbol}</span>
                                </span>
                                <span className="history-levels">{action.details}</span>
                              </span>
                              <span className="history-meta">
                                <span>{action.time}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {activePanelTab === "ai" ? (
                    <div className="tab-view ai-tab">
                      <div className="watchlist-head">
                        <div>
                          <h2>AI</h2>
                          <p>Assistant module</p>
                        </div>
                      </div>
                      <div className="ai-placeholder">
                        <p>AI panel is reserved for upcoming features.</p>
                        <p>No actions are connected yet.</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </section>
        </div>

        <section
          className={`backtest-surface ${selectedSurfaceTab === "backtest" ? "" : "hidden"}`}
          aria-label="backtest workspace"
        >
          <div className="backtest-shell">
            <section className="backtest-hero">
              <div className="backtest-hero-copy">
                <span className="backtest-kicker">Backtest Workspace</span>
                <h2>
                  {selectedModel.name} on {selectedTimeframe}
                </h2>
                <p>
                  AI.zip modules stay grouped here with the same core workflow: settings,
                  statistics, trade review, calendar, clustering, graphs, and prop evaluation.
                </p>
              </div>

              <div className="backtest-summary-grid">
                <article className="backtest-summary-card">
                  <span>Net PnL</span>
                  <strong className={backtestSummary.netPnl >= 0 ? "up" : "down"}>
                    {formatSignedUsd(backtestSummary.netPnl)}
                  </strong>
                  <small>{backtestSummary.tradeCount} simulated trades</small>
                </article>
                <article className="backtest-summary-card">
                  <span>Win Rate</span>
                  <strong>{backtestSummary.winRate.toFixed(1)}%</strong>
                  <small>{backtestSummary.avgR.toFixed(2)}R average reward profile</small>
                </article>
                <article className="backtest-summary-card">
                  <span>Profit Factor</span>
                  <strong>{backtestSummary.profitFactor.toFixed(2)}</strong>
                  <small>{Math.round(backtestSummary.avgHoldMinutes)}m average hold</small>
                </article>
                <article className="backtest-summary-card">
                  <span>Worst Pullback</span>
                  <strong className={backtestSummary.maxDrawdown >= 0 ? "up" : "down"}>
                    {formatSignedUsd(backtestSummary.maxDrawdown)}
                  </strong>
                  <small>
                    {backtestSummary.bestDay
                      ? `Best day ${formatSignedUsd(backtestSummary.bestDay.pnl)}`
                      : "Waiting for trade history"}
                  </small>
                </article>
              </div>
            </section>

            <nav className="backtest-tabs" aria-label="backtest modules">
              {backtestTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`backtest-tab ${selectedBacktestTab === tab.id ? "active" : ""}`}
                  onClick={() => setSelectedBacktestTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <section className="backtest-panel">
              {backtestSourceTrades.length === 0 ? (
                <div className="backtest-empty">
                  <h3>Backtest data is still loading</h3>
                  <p>
                    The Backtest modules populate from the simulated history feed. Once candles load,
                    these tabs will fill in automatically.
                  </p>
                </div>
              ) : null}

              {selectedBacktestTab === "mainStats" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Stats (All Trades)</h3>
                        <p>
                          Core AI.zip performance metrics for the active trade slice on{" "}
                          {selectedModel.name} {selectedTimeframe}.
                        </p>
                      </div>
                    </div>

                    <div className="backtest-stats-grid">
                      {mainStatisticsCards.map((item) => (
                        <div
                          key={item.label}
                          className={`backtest-stat-card ${
                            item.tone === "neutral" ? "tone-neutral" : `tone-${item.tone}`
                          } ${
                            item.span === 4 ? "stat-span-4" : item.span === 2 ? "stat-span-2" : ""
                          }`}
                        >
                          <span>{item.label}</span>
                          <strong className={item.tone === "neutral" ? "" : item.tone}>
                            {item.value}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "mainSettings" ? (
                <div className="backtest-grid two-up">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Settings</h3>
                        <p>AI.zip-style core controls with the missing advanced section restored.</p>
                      </div>
                    </div>

                    <div className="ai-zip-section">
                      <div className="ai-zip-section-title">AI</div>

                      <button
                        type="button"
                        className={`ai-zip-button feature ${aiMode !== "off" ? "active" : ""}`}
                        onClick={() => {
                          setAiMode((current) => {
                            const next =
                              current === "off" ? "knn" : current === "knn" ? "hdbscan" : "off";

                            if (next === "off") {
                              setAiModelEnabled(false);
                              setAiFilterEnabled(false);
                            } else if (!aiModelEnabled && !aiFilterEnabled) {
                              setAiFilterEnabled(true);
                            }

                            return next;
                          });
                        }}
                      >
                        Artificial Intelligence - {aiMode === "off" ? "OFF" : aiMode.toUpperCase()}
                      </button>

                      <button
                        type="button"
                        className={`ai-zip-button toggle ${aiMode !== "off" && aiModelEnabled ? "active" : ""}`}
                        disabled={aiMode === "off"}
                        onClick={() => setAiModelEnabled((value) => !value)}
                      >
                        AI Model {aiModelEnabled ? "· ON" : "· OFF"}
                      </button>

                      <button
                        type="button"
                        className={`ai-zip-button toggle ${aiMode !== "off" && aiFilterEnabled ? "active" : ""}`}
                        disabled={aiMode === "off"}
                        onClick={() => setAiFilterEnabled((value) => !value)}
                      >
                        AI Filter {aiFilterEnabled ? "· ON" : "· OFF"}
                      </button>

                      <button
                        type="button"
                        className={`ai-zip-button toggle ${staticLibrariesClusters ? "active success" : ""}`}
                        disabled={aiMode === "off"}
                        onClick={() => setStaticLibrariesClusters((value) => !value)}
                      >
                        Static Libraries &amp; Clusters {staticLibrariesClusters ? "· ON" : "· OFF"}
                      </button>

                      <div className={`ai-zip-control ${aiMode === "off" ? "disabled" : ""}`}>
                        <div className="ai-zip-label">AI Confidence Threshold</div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={confidenceThreshold}
                          disabled={aiMode === "off"}
                          onChange={(event) => {
                            setConfidenceThreshold(clamp(Number(event.target.value) || 0, 0, 100));
                          }}
                          className="backtest-slider"
                        />
                        <div className="ai-zip-note">{confidenceThreshold}</div>
                      </div>
                    </div>
                  </div>

                  <div className="backtest-stack">
                    <div className="backtest-card">
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Advanced AI Settings</div>

                        <div className={`ai-zip-control ${aiMode === "off" ? "disabled" : ""}`}>
                          <div className="ai-zip-label">AI Exit Strictness</div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={aiExitStrictness}
                            disabled={aiMode === "off"}
                            onChange={(event) => {
                              setAiExitStrictness(clamp(Number(event.target.value) || 0, 0, 100));
                            }}
                            className="backtest-slider"
                          />
                          <div className="ai-zip-note">
                            {aiExitStrictness === 0
                              ? "0 (OFF)"
                              : `${aiExitStrictness} (1 = lenient · 100 = aggressive)`}
                          </div>
                        </div>

                        <div
                          className={`ai-zip-control ${aiExitStrictness === 0 ? "disabled" : ""}`}
                        >
                          <div className="ai-zip-label">Loss Tolerance</div>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            step={1}
                            value={aiExitLossTolerance}
                            disabled={aiExitStrictness === 0}
                            onChange={(event) => {
                              setAiExitLossTolerance(
                                clamp(Number(event.target.value) || 0, -100, 100)
                              );
                            }}
                            className="backtest-slider"
                          />
                          <div className="ai-zip-note">
                            {aiExitStrictness === 0
                              ? "Set AI Exit Strictness > 0 to enable"
                              : `${aiExitLossTolerance} (0 = neutral)`}
                          </div>
                        </div>

                        <div
                          className={`ai-zip-control ${aiExitStrictness === 0 ? "disabled" : ""}`}
                        >
                          <div className="ai-zip-label">Win Tolerance</div>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            step={1}
                            value={aiExitWinTolerance}
                            disabled={aiExitStrictness === 0}
                            onChange={(event) => {
                              setAiExitWinTolerance(
                                clamp(Number(event.target.value) || 0, -100, 100)
                              );
                            }}
                            className="backtest-slider"
                          />
                          <div className="ai-zip-note">
                            {aiExitStrictness === 0
                              ? "Set AI Exit Strictness > 0 to enable"
                              : `${aiExitWinTolerance} (0 = neutral)`}
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`ai-zip-button toggle ${useMitExit ? "active" : ""}`}
                          onClick={() => setUseMitExit((value) => !value)}
                        >
                          MIT Exit {useMitExit ? "· ON" : "· OFF"}
                        </button>

                        <div className={`ai-zip-control ${aiMode === "off" ? "disabled" : ""}`}>
                          <div className="ai-zip-label">Complexity</div>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            step={1}
                            value={complexity}
                            disabled={aiMode === "off"}
                            onChange={(event) => {
                              setComplexity(clamp(Number(event.target.value) || 1, 1, 100));
                            }}
                            className="backtest-slider"
                          />
                          <div className="ai-zip-note">{complexity}</div>
                        </div>

                        <div className={`ai-zip-control ${aiMode === "off" ? "disabled" : ""}`}>
                          <div className="ai-zip-label">Volatility Filter (keep top)</div>
                          <input
                            type="range"
                            min={0}
                            max={99}
                            step={1}
                            value={volatilityPercentile}
                            disabled={aiMode === "off"}
                            onChange={(event) => {
                              setVolatilityPercentile(
                                clamp(Number(event.target.value) || 0, 0, 99)
                              );
                            }}
                            className="backtest-slider"
                          />
                          <div className="ai-zip-note">
                            {volatilityPercentile === 0
                              ? "0 (OFF)"
                              : `Keep top ${volatilityPercentile}%`}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="ai-zip-section">
                        <div className="ai-zip-section-title">Risk Management</div>
                        <div className="ai-zip-input-grid">
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">TP ($)</span>
                            <input
                              type="number"
                              min={0}
                              step={25}
                              value={tpDollars}
                              onChange={(event) => {
                                setTpDollars(Math.max(0, Number(event.target.value) || 0));
                              }}
                              className="ai-zip-input"
                            />
                          </label>
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">SL ($)</span>
                            <input
                              type="number"
                              min={0}
                              step={25}
                              value={slDollars}
                              onChange={(event) => {
                                setSlDollars(Math.max(0, Number(event.target.value) || 0));
                              }}
                              className="ai-zip-input"
                            />
                          </label>
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">Units ($ / 1.0 move)</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={dollarsPerMove}
                              onChange={(event) => {
                                setDollarsPerMove(Math.max(1, Number(event.target.value) || 1));
                              }}
                              className="ai-zip-input"
                            />
                          </label>
                          <label className="ai-zip-field">
                            <span className="ai-zip-label">Max Bars in Trade</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={maxBarsInTrade}
                              onChange={(event) => {
                                setMaxBarsInTrade(
                                  Math.max(0, Math.floor(Number(event.target.value) || 0))
                                );
                              }}
                              className="ai-zip-input"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Current Gate</h3>
                          <p>
                            Average confidence {backtestSummary.averageConfidence.toFixed(1)}% ·{" "}
                            {backtestTrades.length} trades visible after filters
                          </p>
                        </div>
                      </div>
                      <div className="backtest-stat-list">
                        <div className="backtest-stat-row">
                          <span>AI Method</span>
                          <strong>{aiMode === "off" ? "OFF" : aiMode.toUpperCase()}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>AI Model</span>
                          <strong>{aiModelEnabled ? "ON" : "OFF"}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>AI Filter</span>
                          <strong>{aiFilterEnabled ? "ON" : "OFF"}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Static Libraries</span>
                          <strong>{staticLibrariesClusters ? "ON" : "OFF"}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "history" ? (
                <div className="backtest-grid two-up">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Trading History</h3>
                        <p>Search the current trade list and review it in the same dense AI.zip table style.</p>
                      </div>
                    </div>

                    <div className="backtest-toolbar-row">
                      <input
                        type="search"
                        value={backtestHistoryQuery}
                        onChange={(event) => setBacktestHistoryQuery(event.target.value)}
                        className="backtest-search"
                        placeholder="Search symbol, side, result, or PnL"
                        aria-label="search trading history"
                      />
                      {backtestHistoryQuery.trim() ? (
                        <button
                          type="button"
                          className="backtest-action-btn compact"
                          onClick={() => setBacktestHistoryQuery("")}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>

                    <div className="backtest-toolbar-note">
                      {filteredBacktestHistory.length > 0 ? (
                        <>
                          Showing <strong>{filteredBacktestHistory.length}</strong> of{" "}
                          <strong>{backtestTrades.length}</strong> trades
                        </>
                      ) : (
                        <>No trades match the current filters.</>
                      )}
                    </div>

                    <div className="backtest-history-table-wrap">
                      <table className="backtest-history-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Trade</th>
                            <th>Direction</th>
                            <th>Session</th>
                            <th>Entry</th>
                            <th>Exit</th>
                            <th>Duration</th>
                            <th>Exit By</th>
                            <th>PnL</th>
                            <th>Confidence</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBacktestHistory.map((trade, index) => {
                            const durationMinutes = Math.max(
                              1,
                              (Number(trade.exitTime) - Number(trade.entryTime)) / 60
                            );

                            return (
                              <tr
                                key={trade.id}
                                className={trade.pnlUsd >= 0 ? "up-row" : "down-row"}
                                onClick={() => {
                                  focusTradeIdRef.current = trade.id;
                                  setSelectedHistoryId(trade.id);
                                  setSelectedSymbol(trade.symbol);
                                  setShowAllTradesOnChart(false);
                                  setShowActiveTradeOnChart(false);
                                  setSelectedSurfaceTab("chart");
                                }}
                              >
                                <td>{index + 1}</td>
                                <td>
                                  <div className="backtest-history-id">{trade.id}</div>
                                  <div className="backtest-history-subcell">
                                    {trade.symbol} · {trade.result}
                                  </div>
                                </td>
                                <td>
                                  <span
                                    className={`backtest-pill ${
                                      trade.side === "Long" ? "up" : "down"
                                    }`}
                                  >
                                    {trade.side === "Long" ? "Buy" : "Sell"}
                                  </span>
                                </td>
                                <td>{getSessionLabel(trade.entryTime)}</td>
                                <td>
                                  <div>{trade.entryAt}</div>
                                  <div className="backtest-history-subcell">
                                    {formatPrice(trade.entryPrice)}
                                  </div>
                                </td>
                                <td>
                                  <div>{trade.exitAt}</div>
                                  <div className="backtest-history-subcell">
                                    {formatPrice(trade.outcomePrice)}
                                  </div>
                                </td>
                                <td>{formatMinutesCompact(durationMinutes)}</td>
                                <td>{getBacktestExitLabel(trade)}</td>
                                <td>
                                  <div className={trade.pnlUsd >= 0 ? "up" : "down"}>
                                    {formatSignedUsd(trade.pnlUsd)}
                                  </div>
                                  <div
                                    className={`backtest-history-subcell ${
                                      trade.pnlPct >= 0 ? "up" : "down"
                                    }`}
                                  >
                                    {formatSignedPercent(trade.pnlPct)}
                                  </div>
                                </td>
                                <td>{Math.round(getTradeConfidenceScore(trade) * 100)}%</td>
                                <td>
                                  <button
                                    type="button"
                                    className="backtest-action-btn compact"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      focusTradeIdRef.current = trade.id;
                                      setSelectedHistoryId(trade.id);
                                      setSelectedSymbol(trade.symbol);
                                      setShowAllTradesOnChart(false);
                                      setShowActiveTradeOnChart(false);
                                      setSelectedSurfaceTab("chart");
                                    }}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {filteredBacktestHistory.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="backtest-history-empty">
                                No trades match the current time filters or AI confidence threshold.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="backtest-stack">
                    <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Trade Tape</h3>
                          <p>Quick quality checks from the active history slice.</p>
                        </div>
                      </div>
                      <div className="backtest-stat-list">
                        <div className="backtest-stat-row">
                          <span>Largest win</span>
                          <strong className="up">{formatSignedUsd(backtestSummary.maxWin)}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Largest loss</span>
                          <strong className="down">{formatSignedUsd(backtestSummary.maxLoss)}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Gross wins</span>
                          <strong className="up">${formatUsd(backtestSummary.grossWins)}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Gross losses</span>
                          <strong className="down">{formatSignedUsd(backtestSummary.grossLosses)}</strong>
                        </div>
                      </div>
                    </div>

                  <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Recent Sequence</h3>
                          <p>Latest closes from the current filtered sample.</p>
                        </div>
                      </div>
                      <div className="backtest-mini-list">
                        {filteredBacktestHistory.slice(0, 6).map((trade) => (
                          <div key={`${trade.id}-mini`} className="backtest-mini-row">
                            <span>{trade.symbol}</span>
                            <span>{getSessionLabel(trade.entryTime)}</span>
                            <strong className={trade.pnlUsd >= 0 ? "up" : "down"}>
                              {formatSignedUsd(trade.pnlUsd)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "calendar" ? (
                <div className="backtest-grid">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Calendar</h3>
                        <p>Daily trade clustering with the same compact AI.zip-style month view.</p>
                      </div>
                    </div>

                    <div className="backtest-calendar-nav compact">
                      <button
                        type="button"
                        className="backtest-action-btn"
                        disabled={selectedBacktestMonthIndex >= availableBacktestMonths.length - 1}
                        onClick={() => {
                          if (selectedBacktestMonthIndex < 0) {
                            return;
                          }

                          const nextIndex = Math.min(
                            availableBacktestMonths.length - 1,
                            selectedBacktestMonthIndex + 1
                          );
                          setSelectedBacktestMonthKey(availableBacktestMonths[nextIndex] ?? "");
                        }}
                      >
                        {"<"}
                      </button>
                      <span className="backtest-calendar-label">{calendarMonthLabel}</span>
                      <button
                        type="button"
                        className="backtest-action-btn"
                        disabled={selectedBacktestMonthIndex <= 0}
                        onClick={() => {
                          if (selectedBacktestMonthIndex <= 0) {
                            return;
                          }

                          const nextIndex = Math.max(0, selectedBacktestMonthIndex - 1);
                          setSelectedBacktestMonthKey(availableBacktestMonths[nextIndex] ?? "");
                        }}
                      >
                        {">"}
                      </button>
                    </div>

                    {selectedBacktestMonthKey ? (
                      <div
                        className={`backtest-month-pill ${
                          selectedBacktestMonthPnl > 0
                            ? "up"
                            : selectedBacktestMonthPnl < 0
                              ? "down"
                              : "neutral"
                        }`}
                      >
                        {calendarMonthLabel} PnL: {formatSignedUsd(selectedBacktestMonthPnl)}
                      </div>
                    ) : null}

                    <div className="backtest-calendar-weekdays">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>

                    <div className="backtest-calendar-grid">
                      {backtestCalendarGrid.map((cell) => (
                        <button
                          key={cell.dateKey}
                          type="button"
                          className={`backtest-calendar-cell ${
                            cell.dateKey === selectedBacktestDateKey ? "selected" : ""
                          } ${cell.inMonth ? "" : "muted"}`}
                          onClick={() => setSelectedBacktestDateKey(cell.dateKey)}
                        >
                          <span>{cell.day}</span>
                          {cell.activity ? (
                            <>
                              <strong>{cell.activity.count}T</strong>
                              <small className={cell.activity.pnl >= 0 ? "up" : "down"}>
                                {formatSignedUsd(cell.activity.pnl)}
                              </small>
                            </>
                          ) : (
                            <small>No trades</small>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="backtest-calendar-detail">
                      <div className="backtest-card-head">
                        <div>
                          <h3>
                            {selectedBacktestDateKey
                              ? getCalendarDateLabel(selectedBacktestDateKey)
                              : "Select a date"}
                          </h3>
                          <p>
                            {selectedBacktestDateKey
                              ? `${getWeekdayLabel(selectedBacktestDateKey)} session breakdown`
                              : "Pick any active day to inspect fills."}
                          </p>
                        </div>
                      </div>

                      <div className="backtest-mini-list">
                        {selectedBacktestDayTrades.map((trade) => (
                          <div key={`${trade.id}-calendar`} className="backtest-day-row">
                            <div>
                              <strong>
                                {trade.symbol} · {trade.side}
                              </strong>
                              <span>
                                {trade.entryAt} to {trade.exitAt}
                              </span>
                              <span>
                                {formatPrice(trade.entryPrice)} to {formatPrice(trade.outcomePrice)} ·{" "}
                                {getSessionLabel(trade.entryTime)}
                              </span>
                            </div>
                            <strong className={trade.pnlUsd >= 0 ? "up" : "down"}>
                              {formatSignedUsd(trade.pnlUsd)}
                            </strong>
                          </div>
                        ))}
                        {selectedBacktestDayTrades.length === 0 ? (
                          <div className="backtest-empty-inline">No trades closed on the selected day.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "cluster" ? (
                <div className="backtest-grid two-up">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Cluster Map</h3>
                        <p>
                          PnL % sits on X, hold time sits on Y, and node size follows position size.
                        </p>
                      </div>
                    </div>

                    <div className="backtest-toolbar-note">
                      Plotting <strong>{backtestClusterData.nodes.length}</strong> trades across{" "}
                      <strong>{backtestClusterData.groups.length}</strong> active clusters.
                    </div>

                    <div className="backtest-cluster-map">
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="cluster map">
                        <line x1="10" y1="88" x2="90" y2="88" className="backtest-axis-line" />
                        <line x1="10" y1="12" x2="10" y2="88" className="backtest-axis-line" />
                        <line x1="50" y1="12" x2="50" y2="88" className="backtest-grid-line" />
                        <line x1="10" y1="50" x2="90" y2="50" className="backtest-grid-line" />
                        {backtestClusterData.nodes.map((node) => (
                          <circle
                            key={node.id}
                            cx={node.x}
                            cy={node.y}
                            r={node.r}
                            className={`backtest-cluster-node ${node.tone}`}
                          />
                        ))}
                      </svg>
                    </div>

                    <div className="backtest-map-legend">
                      <span>Left: weaker outcome</span>
                      <span>Right: stronger outcome</span>
                      <span>Higher: faster exit</span>
                      <span>Lower: longer hold</span>
                    </div>
                  </div>

                  <div className="backtest-stack">
                    {backtestClusterData.groups.map((group) => (
                      <div key={group.id} className="backtest-card compact">
                        <div className="backtest-card-head">
                          <div>
                            <h3>{group.label}</h3>
                            <p>{group.description}</p>
                          </div>
                        </div>
                        <div className="backtest-stat-list">
                          <div className="backtest-stat-row">
                            <span>Trades</span>
                            <strong>{group.count}</strong>
                          </div>
                          <div className="backtest-stat-row">
                            <span>Win rate</span>
                            <strong>{group.winRate.toFixed(1)}%</strong>
                          </div>
                          <div className="backtest-stat-row">
                            <span>Avg PnL</span>
                            <strong className={group.avgPnl >= 0 ? "up" : "down"}>
                              {formatSignedUsd(group.avgPnl)}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "timeSettings" ? (
                <div className="backtest-grid">
                  <div className="backtest-grid two-up">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Sessions</h3>
                          <p>Exact AI.zip-style session tiles, now wired directly into the backtest filters.</p>
                        </div>
                      </div>
                      <div className="ai-zip-toggle-grid tiles">
                        {backtestSessionLabels.map((label) => {
                          const active = enabledBacktestSessions.includes(label);

                          return (
                            <button
                              key={label}
                              type="button"
                              className={`backtest-filter-tile ${
                                active ? "active" : ""
                              } session-${label.toLowerCase().replace(/\s+/g, "-")}`}
                              onClick={() => {
                                setEnabledBacktestSessions((current) => {
                                  if (current.includes(label)) {
                                    return current.length === 1
                                      ? current
                                      : current.filter((value) => value !== label);
                                  }

                                  return [...current, label];
                                });
                              }}
                            >
                              <strong>{label}</strong>
                              <span>{active ? "ON" : "OFF"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Months</h3>
                          <p>Monthly gating moved into its own filter surface.</p>
                        </div>
                      </div>
                      <div className="ai-zip-toggle-grid tiles compact">
                        {backtestMonthLabels.map((label, monthIndex) => {
                          const active = enabledBacktestMonths.includes(monthIndex);

                          return (
                            <button
                              key={label}
                              type="button"
                              className={`backtest-filter-tile ${active ? "active" : ""}`}
                              onClick={() => {
                                setEnabledBacktestMonths((current) => {
                                  if (current.includes(monthIndex)) {
                                    return current.length === 1
                                      ? current
                                      : current.filter((value) => value !== monthIndex);
                                  }

                                  return [...current, monthIndex];
                                });
                              }}
                            >
                              <strong>{label}</strong>
                              <span>{active ? "ON" : "OFF"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="backtest-grid two-up">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Days of the Week</h3>
                          <p>The weekday filters now match the AI.zip panel layout.</p>
                        </div>
                      </div>
                      <div className="ai-zip-toggle-grid tiles compact">
                        {backtestWeekdayLabels.map((label) => {
                          const active = enabledBacktestWeekdays.includes(label);

                          return (
                            <button
                              key={label}
                              type="button"
                              className={`backtest-filter-tile ${active ? "active" : ""}`}
                              onClick={() => {
                                setEnabledBacktestWeekdays((current) => {
                                  if (current.includes(label)) {
                                    return current.length === 1
                                      ? current
                                      : current.filter((value) => value !== label);
                                  }

                                  return [...current, label];
                                });
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Hours</h3>
                          <p>Fine-grained hour gating with the same color treatment as AI.zip.</p>
                        </div>
                      </div>
                      <div className="ai-zip-toggle-grid tiles compact hours">
                        {backtestHourLabels.map((label, hour) => {
                          const active = enabledBacktestHours.includes(hour);

                          return (
                            <button
                              key={label}
                              type="button"
                              className={`backtest-filter-tile ${active ? "active" : ""}`}
                              onClick={() => {
                                setEnabledBacktestHours((current) => {
                                  if (current.includes(hour)) {
                                    return current.length === 1
                                      ? current
                                      : current.filter((value) => value !== hour);
                                  }

                                  return [...current, hour];
                                });
                              }}
                            >
                              <strong>{label}</strong>
                              <span>{active ? "ON" : "OFF"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="backtest-grid two-up">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Month Performance</h3>
                          <p>Performance by month after the active time and confidence filters.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {backtestTemporalStats.months.map((row) => {
                          const maxCount = Math.max(
                            1,
                            ...backtestTemporalStats.months.map((item) => item.count)
                          );

                          return (
                            <div key={row.label} className="backtest-bar-row">
                              <div className="backtest-bar-copy">
                                <strong>{row.label}</strong>
                                <span>{row.count} trades</span>
                              </div>
                              <div className="backtest-bar-track">
                                <div
                                  className={`backtest-bar-fill ${row.pnl >= 0 ? "up" : "down"}`}
                                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                                />
                              </div>
                              <div className="backtest-bar-values">
                                <span>{row.winRate.toFixed(0)}%</span>
                                <strong className={row.pnl >= 0 ? "up" : "down"}>
                                  {formatSignedUsd(row.pnl)}
                                </strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Weekday Performance</h3>
                          <p>Performance by weekday after the active time and confidence filters.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {backtestTemporalStats.weekdays.map((row) => {
                          const maxCount = Math.max(
                            1,
                            ...backtestTemporalStats.weekdays.map((item) => item.count)
                          );

                          return (
                            <div key={row.label} className="backtest-bar-row">
                              <div className="backtest-bar-copy">
                                <strong>{row.label}</strong>
                                <span>{row.count} trades</span>
                              </div>
                              <div className="backtest-bar-track">
                                <div
                                  className={`backtest-bar-fill ${row.pnl >= 0 ? "up" : "down"}`}
                                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                                />
                              </div>
                              <div className="backtest-bar-values">
                                <span>{row.winRate.toFixed(0)}%</span>
                                <strong className={row.pnl >= 0 ? "up" : "down"}>
                                  {formatSignedUsd(row.pnl)}
                                </strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Session Performance</h3>
                          <p>Session breakdown after the active time and confidence filters.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {backtestTemporalStats.sessions.map((row) => {
                          const maxCount = Math.max(
                            1,
                            ...backtestTemporalStats.sessions.map((item) => item.count)
                          );

                          return (
                            <div key={row.label} className="backtest-bar-row">
                              <div className="backtest-bar-copy">
                                <strong>{row.label}</strong>
                                <span>{row.count} trades</span>
                              </div>
                              <div className="backtest-bar-track">
                                <div
                                  className={`backtest-bar-fill ${row.pnl >= 0 ? "up" : "down"}`}
                                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                                />
                              </div>
                              <div className="backtest-bar-values">
                                <span>{row.winRate.toFixed(0)}%</span>
                                <strong className={row.pnl >= 0 ? "up" : "down"}>
                                  {formatSignedUsd(row.pnl)}
                                </strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Hour Performance</h3>
                          <p>Most active hours after the current filters.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {[...backtestTemporalStats.hours]
                          .sort((left, right) => right.count - left.count || left.hour - right.hour)
                          .slice(0, 12)
                          .map((row, _, list) => {
                            const maxCount = Math.max(1, ...list.map((item) => item.count));

                            return (
                              <div key={row.label} className="backtest-bar-row">
                                <div className="backtest-bar-copy">
                                  <strong>{row.label}</strong>
                                  <span>{row.count} trades</span>
                                </div>
                                <div className="backtest-bar-track">
                                  <div
                                    className={`backtest-bar-fill ${row.pnl >= 0 ? "up" : "down"}`}
                                    style={{ width: `${(row.count / maxCount) * 100}%` }}
                                  />
                                </div>
                                <div className="backtest-bar-values">
                                  <span>{row.winRate.toFixed(0)}%</span>
                                  <strong className={row.pnl >= 0 ? "up" : "down"}>
                                    {formatSignedUsd(row.pnl)}
                                  </strong>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "entryExit" ? (
                <div className="backtest-grid two-up">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Entry / Exit Stats</h3>
                        <p>Archive-style distribution view with the same color-coded breakdown.</p>
                      </div>
                    </div>

                    <div className="backtest-toolbar-row">
                      <button
                        type="button"
                        className={`ai-zip-button pill ${entryExitChartMode === "entry" ? "active" : ""}`}
                        onClick={() => setEntryExitChartMode("entry")}
                      >
                        Entry Sessions
                      </button>
                      <button
                        type="button"
                        className={`ai-zip-button pill ${entryExitChartMode === "exit" ? "active" : ""}`}
                        onClick={() => setEntryExitChartMode("exit")}
                      >
                        Exit Outcomes
                      </button>
                    </div>

                    <div className="backtest-bar-list framed">
                      {backtestEntryExitChartRows.map((row) => {
                        const maxCount = Math.max(
                          1,
                          ...backtestEntryExitChartRows.map((item) => item.count)
                        );

                        return (
                          <div key={row.key} className="backtest-bar-row">
                            <div className="backtest-bar-copy">
                              <strong>{row.label}</strong>
                              <span>{row.detail}</span>
                            </div>
                            <div className="backtest-bar-track">
                              <div
                                className={`backtest-bar-fill ${row.tone}`}
                                style={{ width: `${(row.count / maxCount) * 100}%` }}
                              />
                            </div>
                            <div className="backtest-bar-values">
                              <span>{row.count}</span>
                              <strong className={row.tone === "neutral" ? "" : row.tone}>
                                {entryExitChartMode === "entry"
                                  ? formatSignedUsd(row.value)
                                  : `${row.value.toFixed(0)}%`}
                              </strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="backtest-stack">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Execution Geometry</h3>
                          <p>Average execution geometry across the current test run.</p>
                        </div>
                      </div>

                      <div className="backtest-metric-grid">
                        <div className="backtest-metric-card">
                          <span>Avg Entry</span>
                          <strong>{formatPrice(backtestEntryExitStats.avgEntry)}</strong>
                        </div>
                        <div className="backtest-metric-card">
                          <span>Avg Exit</span>
                          <strong>{formatPrice(backtestEntryExitStats.avgExit)}</strong>
                        </div>
                        <div className="backtest-metric-card">
                          <span>Avg TP Gap</span>
                          <strong>{formatPrice(backtestEntryExitStats.avgTargetDistance)}</strong>
                        </div>
                        <div className="backtest-metric-card">
                          <span>Avg SL Gap</span>
                          <strong>{formatPrice(backtestEntryExitStats.avgStopDistance)}</strong>
                        </div>
                        <div className="backtest-metric-card">
                          <span>Avg Size</span>
                          <strong>{formatUnits(backtestEntryExitStats.avgUnits)} u</strong>
                        </div>
                        <div className="backtest-metric-card">
                          <span>Avg Hold</span>
                          <strong>{Math.round(backtestEntryExitStats.avgHoldMinutes)}m</strong>
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Directional Split</h3>
                          <p>Long and short behavior side by side.</p>
                        </div>
                      </div>
                      <div className="backtest-stat-list">
                        {backtestEntryExitStats.sides.map((row) => (
                          <div key={row.side} className="backtest-stat-row">
                            <span>{row.side}</span>
                            <strong>{row.winRate.toFixed(1)}%</strong>
                            <small className={row.pnl >= 0 ? "up" : "down"}>
                              {formatSignedUsd(row.pnl)}
                            </small>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "dimensions" ? (
                <div className="backtest-card">
                  <div className="backtest-card-head">
                    <div>
                      <h3>Dimension Statistics</h3>
                      <p>
                        The AI.zip feature-importance scorecard, adapted to the current trade feed.
                      </p>
                    </div>
                  </div>

                  <div className="backtest-dimension-toolbar">
                    <input
                      type="search"
                      value={backtestDimensionQuery}
                      onChange={(event) => setBacktestDimensionQuery(event.target.value)}
                      className="backtest-search"
                      placeholder="Search dimensions"
                      aria-label="search dimensions"
                    />
                    {backtestDimensionQuery.trim() ? (
                      <button
                        type="button"
                        className="backtest-action-btn compact"
                        onClick={() => setBacktestDimensionQuery("")}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  <div className="backtest-dimension-table">
                    <div className="backtest-dimension-table-head">
                      <span>Dimension</span>
                      <span>Reading</span>
                      <span>Strength</span>
                    </div>

                    {filteredBacktestDimensionRows.map((row) => (
                      <div key={row.name} className="backtest-dimension-table-row">
                        <div className="backtest-dimension-copy">
                          <strong>{row.name}</strong>
                          <span>{row.note}</span>
                        </div>
                        <div className="backtest-dimension-reading left">
                          <strong>{row.reading}</strong>
                          <span>{Math.round(clamp(row.score * 100, 0, 100))}/100</span>
                        </div>
                        <div className="backtest-dimension-score">
                          <div className="backtest-dimension-meter">
                            <div
                              className={`backtest-dimension-fill ${
                                row.score >= 0.62 ? "up" : row.score <= 0.42 ? "down" : "neutral"
                              }`}
                              style={{ width: `${clamp(row.score * 100, 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredBacktestDimensionRows.length === 0 ? (
                      <div className="backtest-empty-inline">No dimensions match the current search.</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "graphs" ? (
                <div className="backtest-grid two-up">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Statistical Graphs</h3>
                        <p>Interactive scatter view styled after the AI.zip graph module.</p>
                      </div>
                    </div>

                    <div className="backtest-toolbar-row">
                      <label className="backtest-inline-select">
                        <span>X</span>
                        <select
                          value={scatterXKey}
                          onChange={(event) =>
                            setScatterXKey(event.target.value as BacktestScatterKey)
                          }
                        >
                          {(["pnlUsd", "pnlPct", "holdMinutes", "units", "confidence"] as const).map(
                            (key) => (
                              <option key={key} value={key}>
                                {getBacktestScatterLabel(key)}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                      <label className="backtest-inline-select">
                        <span>Y</span>
                        <select
                          value={scatterYKey}
                          onChange={(event) =>
                            setScatterYKey(event.target.value as BacktestScatterKey)
                          }
                        >
                          {(["pnlUsd", "pnlPct", "holdMinutes", "units", "confidence"] as const).map(
                            (key) => (
                              <option key={key} value={key}>
                                {getBacktestScatterLabel(key)}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    </div>

                    <div className="backtest-scatter-wrap">
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="scatter plot">
                        <line x1="8" y1="92" x2="92" y2="92" className="backtest-axis-line" />
                        <line x1="8" y1="8" x2="8" y2="92" className="backtest-axis-line" />
                        <line x1="8" y1="50" x2="92" y2="50" className="backtest-grid-line" />
                        <line x1="50" y1="8" x2="50" y2="92" className="backtest-grid-line" />
                        {backtestScatterPlot.xZero != null ? (
                          <line
                            x1={backtestScatterPlot.xZero}
                            y1="8"
                            x2={backtestScatterPlot.xZero}
                            y2="92"
                            className="backtest-zero-line"
                          />
                        ) : null}
                        {backtestScatterPlot.yZero != null ? (
                          <line
                            x1="8"
                            y1={backtestScatterPlot.yZero}
                            x2="92"
                            y2={backtestScatterPlot.yZero}
                            className="backtest-zero-line"
                          />
                        ) : null}
                        {backtestScatterPlot.points.map((point) => (
                          <circle
                            key={point.id}
                            cx={point.cx}
                            cy={point.cy}
                            r="1.8"
                            className={`backtest-scatter-dot ${
                              point.trade.result === "Win" ? "up" : "down"
                            }`}
                          >
                            <title>
                              {`${point.trade.symbol} · ${getBacktestScatterLabel(
                                scatterXKey
                              )}: ${formatBacktestScatterValue(
                                scatterXKey,
                                point.x
                              )} · ${getBacktestScatterLabel(
                                scatterYKey
                              )}: ${formatBacktestScatterValue(scatterYKey, point.y)}`}
                            </title>
                          </circle>
                        ))}
                      </svg>
                    </div>

                    <div className="backtest-map-legend">
                      <span>X: {getBacktestScatterLabel(scatterXKey)}</span>
                      <span>Y: {getBacktestScatterLabel(scatterYKey)}</span>
                      <span>Green: wins</span>
                      <span>Red: losses</span>
                    </div>
                  </div>

                  <div className="backtest-stack">
                    <div className="backtest-card">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Monthly PnL</h3>
                          <p>Last six active months from the current data set.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {backtestGraphData.monthBars.map((bar) => {
                          const maxValue = Math.max(
                            1,
                            ...backtestGraphData.monthBars.map((item) => Math.abs(item.value))
                          );

                          return (
                            <div key={bar.key} className="backtest-bar-row">
                              <div className="backtest-bar-copy">
                                <strong>{bar.label}</strong>
                                <span>{getMonthLabel(bar.key)}</span>
                              </div>
                              <div className="backtest-bar-track">
                                <div
                                  className={`backtest-bar-fill ${bar.value >= 0 ? "up" : "down"}`}
                                  style={{ width: `${(Math.abs(bar.value) / maxValue) * 100}%` }}
                                />
                              </div>
                              <div className="backtest-bar-values">
                                <strong className={bar.value >= 0 ? "up" : "down"}>
                                  {formatSignedUsd(bar.value)}
                                </strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>PnL Distribution</h3>
                          <p>Bucketed outcomes for quick tail-risk inspection.</p>
                        </div>
                      </div>
                      <div className="backtest-bar-list">
                        {backtestGraphData.buckets.map((bucket) => (
                          <div key={bucket.label} className="backtest-bar-row compact">
                            <div className="backtest-bar-copy">
                              <strong>{bucket.label}</strong>
                            </div>
                            <div className="backtest-bar-track">
                              <div
                                className="backtest-bar-fill neutral"
                                style={{
                                  width: `${
                                    backtestSummary.tradeCount > 0
                                      ? (bucket.count / backtestSummary.tradeCount) * 100
                                      : 0
                                  }%`
                                }}
                              />
                            </div>
                            <div className="backtest-bar-values">
                              <span>
                                {bucket.count} / {backtestSummary.tradeCount}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedBacktestTab === "propFirm" ? (
                <div className="backtest-grid two-up">
                  <div className="backtest-card">
                    <div className="backtest-card-head">
                      <div>
                        <h3>Prop Firm Tool</h3>
                        <p>Replay the current sample against prop-style challenge limits.</p>
                      </div>
                    </div>

                    <div className="backtest-toolbar-row">
                      <button
                        type="button"
                        className={`ai-zip-button pill ${
                          propProjectionMethod === "historical" ? "active" : ""
                        }`}
                        onClick={() => setPropProjectionMethod("historical")}
                      >
                        Historical
                      </button>
                      <button
                        type="button"
                        className={`ai-zip-button pill ${
                          propProjectionMethod === "montecarlo" ? "active" : ""
                        }`}
                        onClick={() => setPropProjectionMethod("montecarlo")}
                      >
                        Monte Carlo
                      </button>
                    </div>

                    <div className="backtest-input-grid">
                      <label className="backtest-input-field">
                        <span>Initial Balance</span>
                        <input
                          type="number"
                          value={propInitialBalance}
                          onChange={(event) => setPropInitialBalance(Number(event.target.value) || 0)}
                        />
                      </label>
                      <label className="backtest-input-field">
                        <span>Daily Max Loss</span>
                        <input
                          type="number"
                          value={propDailyMaxLoss}
                          onChange={(event) => setPropDailyMaxLoss(Number(event.target.value) || 0)}
                        />
                      </label>
                      <label className="backtest-input-field">
                        <span>Total Max Loss</span>
                        <input
                          type="number"
                          value={propTotalMaxLoss}
                          onChange={(event) => setPropTotalMaxLoss(Number(event.target.value) || 0)}
                        />
                      </label>
                      <label className="backtest-input-field">
                        <span>Profit Target</span>
                        <input
                          type="number"
                          value={propProfitTarget}
                          onChange={(event) => setPropProfitTarget(Number(event.target.value) || 0)}
                        />
                      </label>
                    </div>

                    <div className="backtest-progress-block">
                      <div className="backtest-progress-head">
                        <span>Challenge progress</span>
                        <strong>{propFirmProjection.progressPct.toFixed(1)}%</strong>
                      </div>
                      <div className="backtest-progress-track">
                        <div
                          className={`backtest-progress-fill ${
                            propFirmProjection.status === "Failed"
                              ? "down"
                              : propFirmProjection.status === "Passed"
                                ? "up"
                                : "neutral"
                          }`}
                          style={{ width: `${propFirmProjection.progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="backtest-stack">
                    <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>{propFirmProjection.status}</h3>
                          <p>
                            {propFirmProjection.reason} ·{" "}
                            {propProjectionMethod === "historical"
                              ? "Historical order"
                              : "Deterministic Monte Carlo path"}
                          </p>
                        </div>
                      </div>
                      <div className="backtest-stat-list">
                        <div className="backtest-stat-row">
                          <span>Final balance</span>
                          <strong
                            className={
                              propFirmProjection.finalBalance >= propInitialBalance ? "up" : "down"
                            }
                          >
                            ${formatUsd(propFirmProjection.finalBalance)}
                          </strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Target balance</span>
                          <strong>${formatUsd(propFirmProjection.targetBalance)}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Remaining</span>
                          <strong>${formatUsd(propFirmProjection.remaining)}</strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Worst drawdown</span>
                          <strong className={propFirmProjection.worstDrawdown >= 0 ? "up" : "down"}>
                            {formatSignedUsd(propFirmProjection.worstDrawdown)}
                          </strong>
                        </div>
                        <div className="backtest-stat-row">
                          <span>Trading days</span>
                          <strong>{propFirmProjection.tradingDays}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="backtest-card compact">
                      <div className="backtest-card-head">
                        <div>
                          <h3>Balance Path</h3>
                          <p>Historical sequence under the current limits.</p>
                        </div>
                      </div>
                      <div className="backtest-graph-wrap short">
                        <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="balance path">
                          <line x1="0" y1="31" x2="100" y2="31" className="backtest-grid-line" />
                          <path
                            d={propFirmProjection.balancePath}
                            className={`backtest-line-path ${
                              propFirmProjection.finalBalance >= propInitialBalance ? "up" : "down"
                            }`}
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </section>

      <footer className="statusbar">
        <span>{selectedAsset.symbol}</span>
        <span>{selectedTimeframe}</span>
        <span>Model: {selectedModel.name}</span>
        <span>Feed: simulated</span>
        <span>UTC</span>
      </footer>
    </main>
  );
}
