import {
  GRAPH_TEMPLATE_ID_SET,
  buildFallbackChartAnimation,
  normalizeChartActions,
  resolveGraphTemplate,
  type AssistantChartAction,
  type AssistantChartAnimation
} from "../../assistant-tools";
import type {
  GideonArtifact,
  GideonChartPlan,
  GideonRequestKind,
  GideonRuntimeAction,
  GideonRuntimeCandle,
  GideonRuntimeContext,
  GideonRuntimeTrade
} from "../contracts";
import { pickAnimationTemplate } from "../templates/animation";

export type GideonPanelChart = {
  id: string;
  template: string;
  title: string;
  subtitle?: string;
  mode?: "static" | "dynamic";
  data: Array<Record<string, string | number>>;
  config?: Record<string, string | number | boolean>;
};

const STATIC_PRICE_ACTION_TEMPLATE_SET = new Set<string>([
  "price_action",
  "close_with_range",
  "equity_vs_price"
]);

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
};

const normalizeTimestampMs = (value: number): number => {
  if (!Number.isFinite(value)) {
    return value;
  }
  const abs = Math.abs(value);
  if (abs < 1e11) return Math.trunc(value * 1000);
  if (abs > 1e15) return Math.trunc(value / 1000);
  return Math.trunc(value);
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const takeTail = <T>(rows: T[], count: number): T[] => {
  if (!Array.isArray(rows) || rows.length <= count) {
    return rows;
  }
  return rows.slice(rows.length - count);
};

const formatTimeLabel = (timestampMs: number): string => {
  const date = new Date(normalizeTimestampMs(timestampMs));
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes} UTC`;
};

const getRecentWindowCount = (timeframe: string): number => {
  const normalized = String(timeframe || "M15").trim().toUpperCase();
  const byTimeframe: Record<string, number> = {
    M1: 720,
    M5: 600,
    M15: 480,
    M30: 420,
    H1: 360,
    H4: 300,
    D: 220,
    W: 160,
    M: 120
  };
  return byTimeframe[normalized] ?? 480;
};

const getSessionLabel = (
  timestampSeconds: number
): "Tokyo" | "London" | "New York" | "Sydney" => {
  const hour = new Date(normalizeTimestampMs(timestampSeconds)).getUTCHours();
  if (hour >= 7 && hour < 13) return "London";
  if (hour >= 13 && hour < 21) return "New York";
  if (hour >= 21 || hour < 1) return "Sydney";
  return "Tokyo";
};

const extractTemplatePeriod = (templateId: string, fallback: number): number => {
  const match = templateId.match(/_(\d{1,3})(?:_|$)/);
  if (!match) {
    return fallback;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clamp(Math.round(value), 2, 300);
};

const rollingMeanAt = (values: number[], index: number, period: number): number => {
  const end = Math.max(0, Math.min(values.length - 1, index));
  const start = Math.max(0, end - Math.max(1, period) + 1);
  let sum = 0;
  let count = 0;
  for (let cursor = start; cursor <= end; cursor += 1) {
    const value = values[cursor];
    if (!Number.isFinite(value)) {
      continue;
    }
    sum += value;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
};

const rollingStdAt = (values: number[], index: number, period: number): number => {
  const mean = rollingMeanAt(values, index, period);
  const end = Math.max(0, Math.min(values.length - 1, index));
  const start = Math.max(0, end - Math.max(1, period) + 1);
  let sumSq = 0;
  let count = 0;
  for (let cursor = start; cursor <= end; cursor += 1) {
    const value = values[cursor];
    if (!Number.isFinite(value)) {
      continue;
    }
    const diff = value - mean;
    sumSq += diff * diff;
    count += 1;
  }
  if (count <= 1) {
    return 0;
  }
  return Math.sqrt(sumSq / count);
};

const computeEmaSeries = (values: number[], period: number): number[] => {
  if (values.length === 0) {
    return [];
  }
  const alpha = 2 / (Math.max(2, period) + 1);
  const output: number[] = new Array(values.length).fill(0);
  output[0] = values[0] ?? 0;
  for (let index = 1; index < values.length; index += 1) {
    const prev = output[index - 1] ?? values[index - 1] ?? 0;
    const next = values[index] ?? prev;
    output[index] = prev + alpha * (next - prev);
  }
  return output;
};

const computeRsiSeries = (closes: number[], period: number): number[] => {
  if (closes.length === 0) {
    return [];
  }

  const normalizedPeriod = Math.max(2, period);
  const gains: number[] = new Array(closes.length).fill(0);
  const losses: number[] = new Array(closes.length).fill(0);

  for (let index = 1; index < closes.length; index += 1) {
    const diff = (closes[index] ?? 0) - (closes[index - 1] ?? 0);
    gains[index] = diff > 0 ? diff : 0;
    losses[index] = diff < 0 ? Math.abs(diff) : 0;
  }

  const rsi: number[] = new Array(closes.length).fill(50);
  let avgGain = 0;
  let avgLoss = 0;

  for (let index = 1; index < closes.length; index += 1) {
    avgGain = ((avgGain * (normalizedPeriod - 1)) + gains[index]!) / normalizedPeriod;
    avgLoss = ((avgLoss * (normalizedPeriod - 1)) + losses[index]!) / normalizedPeriod;

    if (avgLoss <= 1e-9) {
      rsi[index] = 100;
      continue;
    }

    const rs = avgGain / avgLoss;
    rsi[index] = 100 - 100 / (1 + rs);
  }

  return rsi;
};

const buildDerivedPriceValues = (
  rows: GideonRuntimeCandle[],
  templateId: string
): number[] => {
  if (rows.length === 0) {
    return [];
  }

  const normalizedTemplate = templateId.toLowerCase();
  const closes = rows.map((row) => row.close);
  const highs = rows.map((row) => row.high);
  const lows = rows.map((row) => row.low);
  const volumes = rows.map((row) => Number(row.volume ?? 0));
  const ranges = rows.map((row) => Math.max(0, row.high - row.low));
  const period = extractTemplatePeriod(normalizedTemplate, 14);
  const ema = computeEmaSeries(closes, period);
  const fastEma = computeEmaSeries(closes, 12);
  const slowEma = computeEmaSeries(closes, 26);
  const signalEma = computeEmaSeries(
    fastEma.map((value, index) => value - (slowEma[index] ?? value)),
    9
  );
  const rsi = computeRsiSeries(closes, period);

  if (normalizedTemplate.startsWith("sma_")) {
    return closes.map((_, index) => rollingMeanAt(closes, index, period));
  }
  if (
    normalizedTemplate.startsWith("ema_") ||
    normalizedTemplate.startsWith("rma_") ||
    normalizedTemplate.startsWith("kama_") ||
    normalizedTemplate.startsWith("zlema_")
  ) {
    return ema;
  }
  if (normalizedTemplate.startsWith("wma_")) {
    return closes.map((_, index) => {
      const end = index;
      const start = Math.max(0, end - period + 1);
      let weightedSum = 0;
      let weightTotal = 0;
      let weight = 1;
      for (let cursor = start; cursor <= end; cursor += 1) {
        const close = closes[cursor] ?? 0;
        weightedSum += close * weight;
        weightTotal += weight;
        weight += 1;
      }
      return weightTotal > 0 ? weightedSum / weightTotal : closes[end] ?? 0;
    });
  }
  if (normalizedTemplate.includes("bollinger_upper")) {
    return closes.map((_, index) => {
      const mean = rollingMeanAt(closes, index, period);
      return mean + 2 * rollingStdAt(closes, index, period);
    });
  }
  if (normalizedTemplate.includes("bollinger_lower")) {
    return closes.map((_, index) => {
      const mean = rollingMeanAt(closes, index, period);
      return mean - 2 * rollingStdAt(closes, index, period);
    });
  }
  if (normalizedTemplate.includes("bollinger_mid")) {
    return closes.map((_, index) => rollingMeanAt(closes, index, period));
  }
  if (normalizedTemplate.includes("keltner_upper")) {
    return closes.map(
      (_, index) => rollingMeanAt(closes, index, period) + 1.5 * rollingMeanAt(ranges, index, period)
    );
  }
  if (normalizedTemplate.includes("keltner_lower")) {
    return closes.map(
      (_, index) => rollingMeanAt(closes, index, period) - 1.5 * rollingMeanAt(ranges, index, period)
    );
  }
  if (normalizedTemplate.includes("keltner_mid")) {
    return closes.map((_, index) => rollingMeanAt(closes, index, period));
  }
  if (normalizedTemplate.includes("donchian_upper")) {
    return highs.map((_, index) => Math.max(...highs.slice(Math.max(0, index - period + 1), index + 1)));
  }
  if (normalizedTemplate.includes("donchian_lower")) {
    return lows.map((_, index) => Math.min(...lows.slice(Math.max(0, index - period + 1), index + 1)));
  }
  if (normalizedTemplate.includes("donchian_mid")) {
    return highs.map((_, index) => {
      const start = Math.max(0, index - period + 1);
      const localHigh = Math.max(...highs.slice(start, index + 1));
      const localLow = Math.min(...lows.slice(start, index + 1));
      return (localHigh + localLow) / 2;
    });
  }
  if (normalizedTemplate.includes("vwap")) {
    let cumulativePV = 0;
    let cumulativeVolume = 0;
    return closes.map((close, index) => {
      const typicalPrice = ((highs[index] ?? close) + (lows[index] ?? close) + close) / 3;
      const volume = volumes[index] ?? 0;
      cumulativePV += typicalPrice * volume;
      cumulativeVolume += volume;
      return cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : close;
    });
  }
  if (normalizedTemplate.includes("rsi")) {
    return rsi;
  }
  if (normalizedTemplate.includes("macd_hist")) {
    return fastEma.map((value, index) => value - (slowEma[index] ?? value) - (signalEma[index] ?? 0));
  }
  if (normalizedTemplate.includes("macd_signal")) {
    return signalEma;
  }
  if (normalizedTemplate.includes("macd_line")) {
    return fastEma.map((value, index) => value - (slowEma[index] ?? value));
  }
  if (normalizedTemplate.includes("roc") || normalizedTemplate.includes("ppo")) {
    return closes.map((close, index) => {
      const priorIndex = Math.max(0, index - period);
      const prior = closes[priorIndex] ?? close;
      if (Math.abs(prior) <= 1e-9) {
        return 0;
      }
      return ((close - prior) / prior) * 100;
    });
  }
  if (
    normalizedTemplate.includes("momentum") ||
    normalizedTemplate.includes("mom_") ||
    normalizedTemplate.includes("close_change")
  ) {
    return closes.map((close, index) => {
      if (index === 0) {
        return 0;
      }
      return close - (closes[index - 1] ?? close);
    });
  }
  if (normalizedTemplate.includes("cumulative_volume")) {
    let cumulative = 0;
    return volumes.map((volume) => {
      cumulative += volume;
      return cumulative;
    });
  }
  if (normalizedTemplate.includes("volume")) {
    return volumes;
  }
  if (
    normalizedTemplate.includes("atr") ||
    normalizedTemplate.includes("volatility") ||
    normalizedTemplate.includes("range")
  ) {
    return ranges.map((_, index) => rollingMeanAt(ranges, index, period));
  }
  if (normalizedTemplate.includes("percentile")) {
    return closes.map((close, index) => {
      const window = closes.slice(Math.max(0, index - period + 1), index + 1);
      if (window.length === 0) {
        return 0;
      }
      const sorted = [...window].sort((left, right) => left - right);
      let rank = 0;
      while (rank < sorted.length && sorted[rank]! <= close) {
        rank += 1;
      }
      return (rank / sorted.length) * 100;
    });
  }

  return closes;
};

const mergeCandleRowsPreferLive = (params: {
  live: GideonRuntimeCandle[];
  candles?: GideonRuntimeCandle[] | null;
}): GideonRuntimeCandle[] => {
  const byTime = new Map<number, GideonRuntimeCandle>();

  for (const row of params.candles ?? []) {
    if (!Number.isFinite(row.time)) {
      continue;
    }
    byTime.set(Math.trunc(row.time), row);
  }
  for (const row of params.live) {
    if (!Number.isFinite(row.time)) {
      continue;
    }
    byTime.set(Math.trunc(row.time), row);
  }

  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
};

export const selectRecentWindowCandles = (params: {
  runtime: GideonRuntimeContext;
  candles?: GideonRuntimeCandle[] | null;
}): GideonRuntimeCandle[] => {
  const merged = mergeCandleRowsPreferLive({
    live: params.runtime.liveCandles,
    candles: params.candles
  });
  const windowCount = getRecentWindowCount(params.runtime.timeframe);

  if (merged.length > 0) {
    return merged.slice(-windowCount);
  }

  return params.runtime.liveCandles.slice(-windowCount);
};

export const selectDrawWindowCandles = (params: {
  runtime: GideonRuntimeContext;
  candles?: GideonRuntimeCandle[] | null;
}): GideonRuntimeCandle[] => {
  const windowCount = getRecentWindowCount(params.runtime.timeframe);
  const liveTail = params.runtime.liveCandles.slice(-windowCount);

  if (liveTail.length >= 24) {
    return liveTail;
  }

  return selectRecentWindowCandles(params);
};

const getPriceQuantile = (values: number[], quantile: number): number | null => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(1, quantile)) * (sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const lowValue = sorted[low] ?? sorted[0] ?? 0;
  const highValue = sorted[high] ?? lowValue;
  const weight = index - low;

  return Number((lowValue * (1 - weight) + highValue * weight).toFixed(4));
};

const extractPromptPrice = (prompt: string): number | null => {
  const matches = prompt.match(/\b\d{3,6}(?:\.\d+)?\b/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const candidate = Number(matches[0]);
  return Number.isFinite(candidate) ? candidate : null;
};

const inferCandleStepMs = (candles: GideonRuntimeCandle[]): number => {
  if (candles.length < 2) {
    return 60_000;
  }

  const diffs: number[] = [];
  for (let index = Math.max(1, candles.length - 40); index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (!previous || !current) {
      continue;
    }
    const delta = Math.trunc(current.time) - Math.trunc(previous.time);
    if (Number.isFinite(delta) && delta > 0) {
      diffs.push(delta);
    }
  }

  if (diffs.length === 0) {
    return 60_000;
  }

  diffs.sort((left, right) => left - right);
  return Math.max(1_000, diffs[Math.floor(diffs.length / 2)] ?? 60_000);
};

const parseAdjustIntentAction = (params: {
  prompt: string;
  candles: GideonRuntimeCandle[];
}): AssistantChartAction | null => {
  const prompt = params.prompt.toLowerCase();
  const hasAdjustIntent = /\b(adjust|move|shift|nudge|edit|update|reposition|offset)\b/.test(prompt);
  const hasDrawTarget =
    /\b(drawing|drawings|line|lines|level|levels|annotation|annotations|support|resistance)\b/.test(prompt);

  if (!hasAdjustIntent || !hasDrawTarget) {
    return null;
  }

  let priceDelta = 0;
  const upMatch = prompt.match(/\b(?:up|higher|raise|increase)\s+(\d+(?:\.\d+)?)\b/);
  const downMatch = prompt.match(/\b(?:down|lower|decrease|reduce)\s+(\d+(?:\.\d+)?)\b/);
  const signedMatch = prompt.match(/\b(?:by|delta|offset)\s*(-?\d+(?:\.\d+)?)\b/);

  if (upMatch) {
    priceDelta = Number(upMatch[1]);
  } else if (downMatch) {
    priceDelta = -Number(downMatch[1]);
  } else if (signedMatch) {
    priceDelta = Number(signedMatch[1]);
  }

  const stepMs = inferCandleStepMs(params.candles);
  let timeDeltaMs = 0;
  const rightMatch = prompt.match(/\b(?:right|forward|ahead)\s+(\d+)\s*(?:bars?|candles?)\b/);
  const leftMatch = prompt.match(/\b(?:left|back|backward)\s+(\d+)\s*(?:bars?|candles?)\b/);
  const minuteForwardMatch = prompt.match(/\b(?:forward|ahead)\s+(\d+)\s*(?:m|min|minutes?)\b/);
  const minuteBackwardMatch = prompt.match(/\b(?:back|backward)\s+(\d+)\s*(?:m|min|minutes?)\b/);

  if (rightMatch) {
    timeDeltaMs = Number(rightMatch[1]) * stepMs;
  } else if (leftMatch) {
    timeDeltaMs = -Number(leftMatch[1]) * stepMs;
  } else if (minuteForwardMatch) {
    timeDeltaMs = Number(minuteForwardMatch[1]) * 60_000;
  } else if (minuteBackwardMatch) {
    timeDeltaMs = -Number(minuteBackwardMatch[1]) * 60_000;
  }

  let targetLabel = "";
  if (prompt.includes("support") && !prompt.includes("resistance")) {
    targetLabel = "support";
  } else if (prompt.includes("resistance") && !prompt.includes("support")) {
    targetLabel = "resistance";
  } else if (prompt.includes("trend")) {
    targetLabel = "trend";
  }

  return {
    type: "adjust_previous_drawings",
    priceDelta: Number.isFinite(priceDelta) ? Number(priceDelta.toFixed(4)) : undefined,
    timeDeltaMs: Number.isFinite(timeDeltaMs) ? Math.trunc(timeDeltaMs) : undefined,
    targetLabel: targetLabel || undefined
  };
};

const parseDynamicSupportResistanceControlAction = (
  prompt: string
): AssistantChartAction | null => {
  const normalized = prompt.toLowerCase();
  const mentionsDynamic =
    /\b(dynamic|indicator|auto)\b/.test(normalized) &&
    (normalized.includes("support") || normalized.includes("resistance") || normalized.includes("s/r"));
  if (!mentionsDynamic) {
    return null;
  }

  const isControlToggle = /\b(enable|disable|start|stop|off|on|remove)\b/.test(normalized);
  if (!isControlToggle) {
    return null;
  }

  const disableRequested =
    /\b(disable|off|stop|remove)\b/.test(normalized) &&
    /\b(dynamic|indicator|auto)\b/.test(normalized);
  const levelsMatch = normalized.match(/\b(\d+)\s*(?:levels?|lines?)\b/);
  const lookbackMatch = normalized.match(/\b(\d+)\s*(?:bars?|candles?)\b/);

  return {
    type: "toggle_dynamic_support_resistance",
    enabled: !disableRequested,
    levels: levelsMatch ? clamp(toNumber(levelsMatch[1], 3), 1, 8) : undefined,
    lookback: lookbackMatch ? clamp(toNumber(lookbackMatch[1], 0), 0, 1500) : undefined
  };
};

const parseDynamicDrawAction = (params: {
  prompt: string;
  candles: GideonRuntimeCandle[];
}): AssistantChartAction | null => {
  const normalized = params.prompt.toLowerCase();
  const hasDynamicIntent = /\b(dynamic|indicator|auto)\b/.test(normalized);
  if (!hasDynamicIntent) {
    return null;
  }

  const lookbackMatch = normalized.match(/\b(\d+)\s*(?:bars?|candles?)\b/);
  const levelsMatch = normalized.match(/\b(\d+)\s*(?:levels?|lines?)\b/);
  const dynamicLookback = lookbackMatch ? clamp(toNumber(lookbackMatch[1], 0), 0, 1500) : undefined;
  const levels = levelsMatch ? clamp(toNumber(levelsMatch[1], 2), 1, 8) : undefined;
  const explicitPrice = extractPromptPrice(normalized);

  const baseAction = {
    dynamic: true,
    dynamicLookback
  };

  if (normalized.includes("support") || normalized.includes("resistance") || normalized.includes("s/r")) {
    return {
      ...baseAction,
      type: "draw_support_resistance",
      levels,
      label: "Dynamic S/R"
    };
  }
  if (normalized.includes("trendline") || normalized.includes("trend line")) {
    return {
      ...baseAction,
      type: "draw_trend_line",
      label: "Dynamic Trendline"
    };
  }
  if (normalized.includes("horizontal")) {
    return {
      ...baseAction,
      type: "draw_horizontal_line",
      price: explicitPrice ?? undefined,
      label: "Dynamic Horizontal Level"
    };
  }
  if (normalized.includes("vertical")) {
    return {
      ...baseAction,
      type: "draw_vertical_line",
      label: "Dynamic Vertical Marker"
    };
  }
  if (normalized.includes("box")) {
    return {
      ...baseAction,
      type: "draw_box",
      label: "Dynamic Box"
    };
  }
  if (normalized.includes("fvg") || normalized.includes("fair value gap")) {
    return {
      ...baseAction,
      type: "draw_fvg",
      label: "Dynamic FVG"
    };
  }
  if (normalized.includes("arrow")) {
    return {
      ...baseAction,
      type: "draw_arrow",
      markerShape: "arrowUp",
      label: "Dynamic Arrow"
    };
  }
  if (normalized.includes("long")) {
    return {
      ...baseAction,
      type: "draw_long_position",
      label: "Dynamic Long"
    };
  }
  if (normalized.includes("short")) {
    return {
      ...baseAction,
      type: "draw_short_position",
      label: "Dynamic Short"
    };
  }
  if (normalized.includes("ruler")) {
    return {
      ...baseAction,
      type: "draw_ruler",
      label: "Dynamic Ruler"
    };
  }
  if (normalized.includes("mark") || normalized.includes("candle")) {
    return {
      ...baseAction,
      type: "mark_candlestick",
      markerShape: "circle",
      note: "Dynamic candle marker"
    };
  }
  if (params.candles.length > 0) {
    return {
      ...baseAction,
      type: "draw_support_resistance",
      levels,
      label: "Dynamic S/R"
    };
  }

  return null;
};

const buildRawPromptChartActions = (params: {
  prompt: string;
  candles: GideonRuntimeCandle[];
}): AssistantChartAction[] => {
  const prompt = params.prompt.toLowerCase();
  const candles = params.candles;
  if (candles.length === 0) {
    return [];
  }

  const dynamicControlAction = parseDynamicSupportResistanceControlAction(prompt);
  if (dynamicControlAction) {
    return [dynamicControlAction];
  }

  const adjustAction = parseAdjustIntentAction({ prompt, candles });
  if (adjustAction) {
    return [adjustAction];
  }

  const dynamicAction = parseDynamicDrawAction({ prompt, candles });
  if (dynamicAction) {
    return [dynamicAction];
  }

  const recent = candles.slice(-Math.min(candles.length, 240));
  const last = recent[recent.length - 1]!;
  const first = recent[0]!;
  const lows = recent.map((row) => row.low);
  const highs = recent.map((row) => row.high);
  const support = getPriceQuantile(lows, 0.2) ?? Number(last.low.toFixed(4));
  const resistance = getPriceQuantile(highs, 0.8) ?? Number(last.high.toFixed(4));
  const explicitPrice = extractPromptPrice(prompt);
  const actions: AssistantChartAction[] = [];

  if (prompt.includes("support") || prompt.includes("resistance") || prompt.includes("s/r")) {
    actions.push({
      type: "draw_support_resistance",
      priceStart: support,
      priceEnd: resistance,
      label: "Auto S/R"
    });
  }
  if (prompt.includes("trendline") || prompt.includes("trend line")) {
    actions.push({
      type: "draw_trend_line",
      timeStart: first.time,
      priceStart: first.close,
      timeEnd: last.time,
      priceEnd: last.close,
      label: "Trendline"
    });
  }
  if (prompt.includes("horizontal")) {
    actions.push({
      type: "draw_horizontal_line",
      price: explicitPrice ?? Number(last.close.toFixed(4)),
      label: "Horizontal Level"
    });
  }
  if (prompt.includes("vertical")) {
    actions.push({
      type: "draw_vertical_line",
      time: last.time,
      label: "Vertical Marker"
    });
  }
  if (prompt.includes("box")) {
    actions.push({
      type: "draw_box",
      timeStart: recent[Math.max(0, recent.length - 50)]?.time ?? first.time,
      timeEnd: last.time,
      priceStart: support,
      priceEnd: resistance,
      label: "Range Box"
    });
  }
  if (prompt.includes("fvg") || prompt.includes("fair value gap")) {
    actions.push({
      type: "draw_fvg",
      timeStart: recent[Math.max(0, recent.length - 25)]?.time ?? first.time,
      timeEnd: last.time,
      priceStart: Number(((support + last.close) / 2).toFixed(4)),
      priceEnd: Number(((resistance + last.close) / 2).toFixed(4)),
      label: "FVG"
    });
  }
  if (prompt.includes("arrow")) {
    actions.push({
      type: "draw_arrow",
      time: last.time,
      price: explicitPrice ?? Number(last.close.toFixed(4)),
      markerShape: "arrowUp",
      label: "Arrow"
    });
  }
  if (prompt.includes("ruler")) {
    actions.push({
      type: "draw_ruler",
      timeStart: first.time,
      priceStart: first.close,
      timeEnd: last.time,
      priceEnd: last.close,
      label: "Ruler"
    });
  }
  if (actions.length === 0) {
    actions.push({
      type: "draw_support_resistance",
      priceStart: support,
      priceEnd: resistance,
      label: "Auto S/R"
    });
  }

  return actions.slice(0, 12);
};

export const sanitizeChartActionsTool = (params: {
  actions: AssistantChartAction[];
  candles: GideonRuntimeCandle[];
}): AssistantChartAction[] => {
  const actions = normalizeChartActions(params.actions);
  if (actions.length === 0) {
    return [];
  }

  const recent = params.candles.slice(-Math.min(params.candles.length, 320));
  if (recent.length < 4) {
    return actions;
  }

  const lows = recent.map((row) => row.low);
  const highs = recent.map((row) => row.high);
  const closes = recent.map((row) => row.close);
  const last = recent[recent.length - 1]!;
  const minLow = Math.min(...lows);
  const maxHigh = Math.max(...highs);
  const span = Math.max(0.0001, maxHigh - minLow);
  const lowerBound = minLow - span * 0.5;
  const upperBound = maxHigh + span * 0.5;
  const support = getPriceQuantile(lows, 0.2) ?? last.low;
  const resistance = getPriceQuantile(highs, 0.8) ?? last.high;
  const median = getPriceQuantile(closes, 0.5) ?? last.close;

  const clampPriceToBand = (value: number | undefined, fallback: number): number => {
    if (!Number.isFinite(value)) {
      return Number(fallback.toFixed(4));
    }
    const numeric = Number(value);
    if (numeric < lowerBound || numeric > upperBound) {
      return Number(fallback.toFixed(4));
    }
    return Number(numeric.toFixed(4));
  };

  return actions.map((action) => {
    const next = { ...action };
    if (next.type === "draw_support_resistance") {
      next.priceStart = clampPriceToBand(next.priceStart, support);
      next.priceEnd = clampPriceToBand(next.priceEnd, resistance);
      return next;
    }
    if (next.type === "draw_horizontal_line") {
      next.price = clampPriceToBand(next.price, median);
      return next;
    }
    if (next.type === "draw_box" || next.type === "draw_fvg" || next.type === "draw_ruler") {
      next.priceStart = clampPriceToBand(next.priceStart, support);
      next.priceEnd = clampPriceToBand(next.priceEnd, resistance);
      return next;
    }
    if (next.type === "draw_trend_line") {
      next.priceStart = clampPriceToBand(next.priceStart, support);
      next.priceEnd = clampPriceToBand(next.priceEnd, resistance);
      return next;
    }
    if (next.type === "draw_arrow" || next.type === "mark_candlestick") {
      next.price = clampPriceToBand(next.price, last.close);
      return next;
    }
    if (next.type === "draw_long_position") {
      next.entryPrice = clampPriceToBand(next.entryPrice, median);
      next.stopPrice = clampPriceToBand(next.stopPrice, support);
      next.targetPrice = clampPriceToBand(next.targetPrice, resistance);
      return next;
    }
    if (next.type === "draw_short_position") {
      next.entryPrice = clampPriceToBand(next.entryPrice, median);
      next.stopPrice = clampPriceToBand(next.stopPrice, resistance);
      next.targetPrice = clampPriceToBand(next.targetPrice, support);
      return next;
    }
    return next;
  });
};

export const buildChartActionsTool = (params: {
  prompt: string;
  runtime: GideonRuntimeContext;
  candles?: GideonRuntimeCandle[] | null;
  prependClear?: boolean;
}) => {
  const drawCandles = selectDrawWindowCandles({
    runtime: params.runtime,
    candles: params.candles
  });
  const rawActions = buildRawPromptChartActions({
    prompt: params.prompt,
    candles: drawCandles
  });
  const hasControlAction = rawActions.some((action) => {
    return action.type === "adjust_previous_drawings" || action.type === "toggle_dynamic_support_resistance";
  });
  const normalized = normalizeChartActions(
    params.prependClear !== false && !hasControlAction
      ? [{ type: "clear_annotations" }, ...rawActions]
      : rawActions
  );

  return {
    chartActions: sanitizeChartActionsTool({
      actions: normalized,
      candles: drawCandles
    })
  };
};

export const buildDefaultAnimationActionsTool = (params: {
  runtime: GideonRuntimeContext;
  candles?: GideonRuntimeCandle[] | null;
}) => {
  const candles = selectDrawWindowCandles({
    runtime: params.runtime,
    candles: params.candles
  });
  if (candles.length === 0) {
    return {
      chartActions: [] as AssistantChartAction[]
    };
  }

  const recent = candles.slice(-Math.min(candles.length, 220));
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const lows = recent.map((row) => row.low);
  const highs = recent.map((row) => row.high);
  const support = getPriceQuantile(lows, 0.2) ?? Number(last.low.toFixed(4));
  const resistance = getPriceQuantile(highs, 0.8) ?? Number(last.high.toFixed(4));

  return {
    chartActions: normalizeChartActions([
      { type: "clear_annotations" },
      { type: "move_to_date", time: last.time },
      {
        type: "draw_support_resistance",
        priceStart: support,
        priceEnd: resistance,
        label: "Range"
      },
      {
        type: "draw_trend_line",
        timeStart: first.time,
        priceStart: first.close,
        timeEnd: last.time,
        priceEnd: last.close,
        label: "Trend"
      },
      {
        type: "draw_arrow",
        time: last.time,
        price: Number(last.close.toFixed(4)),
        markerShape: last.close >= first.close ? "arrowUp" : "arrowDown",
        label: "Latest Move"
      }
    ])
  };
};

export const buildChartAnimationTool = (params: {
  prompt: string;
  runtime: GideonRuntimeContext;
  requestKind: GideonRequestKind;
  requestedArtifacts: GideonArtifact[];
  chartActions?: AssistantChartAction[] | null;
  candles?: GideonRuntimeCandle[] | null;
}) => {
  const existingActions = normalizeChartActions(params.chartActions ?? []);
  const actionResult =
    existingActions.length > 0
      ? { chartActions: existingActions }
      : buildDefaultAnimationActionsTool({
          runtime: params.runtime,
          candles: params.candles
        });
  const animationTemplate = pickAnimationTemplate({
    prompt: params.prompt,
    requestKind: params.requestKind,
    requestedArtifacts: params.requestedArtifacts
  });
  const fallbackAnimation = buildFallbackChartAnimation({
    title: animationTemplate.title,
    summary: animationTemplate.summary,
    actions: actionResult.chartActions,
    theme: animationTemplate.theme
  });

  return {
    chartActions: actionResult.chartActions,
    chartAnimations: fallbackAnimation ? [fallbackAnimation] : ([] as AssistantChartAnimation[])
  };
};

const buildEquityCurveChart = (
  rows: GideonRuntimeTrade[],
  title: string,
  points: number,
  templateId: string
): GideonPanelChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const sorted = [...rows].sort(
    (left, right) => toNumber(left.exitTime ?? left.entryTime, 0) - toNumber(right.exitTime ?? right.entryTime, 0)
  );
  const sliced = takeTail(sorted, points);
  let equity = 0;

  const data = sliced.map((row, index) => {
    const pnlUsd = toNumber(row.pnlUsd, 0);
    equity += pnlUsd;
    const exitTime = toNumber(row.exitTime ?? row.entryTime, index);
    return {
      x: formatTimeLabel(exitTime),
      equity: Number(equity.toFixed(2)),
      pnl: Number(pnlUsd.toFixed(2))
    };
  });

  return {
    id: `equity-${toNumber(sorted[sorted.length - 1]?.exitTime ?? sorted[sorted.length - 1]?.entryTime, Date.now())}`,
    template: templateId,
    title,
    subtitle: `${rows.length} trades`,
    data,
    config: {
      xKey: "x",
      yKey: "equity"
    }
  };
};

const buildPnlDistributionChart = (
  rows: GideonRuntimeTrade[],
  title: string,
  templateId: string
): GideonPanelChart | null => {
  if (rows.length < 2) {
    return null;
  }

  const values = rows.map((row) => toNumber(row.pnlUsd, 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bins = 12;
  const span = Math.max(1, max - min);
  const step = span / bins;

  const histogram = Array.from({ length: bins }, (_, index) => ({
    start: min + step * index,
    end: min + step * (index + 1),
    count: 0
  }));

  for (const value of values) {
    const bucket = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / step)));
    histogram[bucket]!.count += 1;
  }

  return {
    id: `hist-${toNumber(rows[rows.length - 1]?.exitTime ?? rows[rows.length - 1]?.entryTime, Date.now())}`,
    template: templateId,
    title,
    subtitle: "PnL histogram",
    data: histogram.map((bucket) => ({
      bucket: `${bucket.start.toFixed(0)}..${bucket.end.toFixed(0)}`,
      count: bucket.count
    })),
    config: {
      xKey: "bucket",
      yKey: "count"
    }
  };
};

const buildSessionPerformanceChart = (
  rows: GideonRuntimeTrade[],
  title: string,
  templateId: string
): GideonPanelChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const order: Array<"Tokyo" | "London" | "New York" | "Sydney"> = [
    "Tokyo",
    "London",
    "New York",
    "Sydney"
  ];

  const buckets = new Map<string, { pnl: number; count: number; wins: number }>();
  for (const row of rows) {
    const session = getSessionLabel(toNumber(row.entryTime ?? row.exitTime, 0));
    const current = buckets.get(session) ?? { pnl: 0, count: 0, wins: 0 };
    current.pnl += toNumber(row.pnlUsd, 0);
    current.count += 1;
    current.wins += String(row.result || "").toLowerCase() === "win" ? 1 : 0;
    buckets.set(session, current);
  }

  return {
    id: `session-${toNumber(rows[rows.length - 1]?.entryTime ?? rows[rows.length - 1]?.exitTime, Date.now())}`,
    template: templateId,
    title,
    data: order.map((session) => {
      const item = buckets.get(session) ?? { pnl: 0, count: 0, wins: 0 };
      const winRate = item.count > 0 ? (item.wins / item.count) * 100 : 0;
      return {
        session,
        pnl: Number(item.pnl.toFixed(2)),
        trades: item.count,
        winRate: Number(winRate.toFixed(2))
      };
    }),
    config: {
      xKey: "session",
      yKey: "pnl",
      yKeyAlt: "winRate"
    }
  };
};

const buildTradeOutcomeChart = (
  rows: GideonRuntimeTrade[],
  title: string,
  templateId: string
): GideonPanelChart | null => {
  if (rows.length === 0) {
    return null;
  }

  let wins = 0;
  let losses = 0;
  for (const row of rows) {
    if (String(row.result || "").toLowerCase() === "win") {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  return {
    id: `outcomes-${rows.length}`,
    template: templateId,
    title,
    data: [
      { label: "Wins", value: wins },
      { label: "Losses", value: losses }
    ],
    config: {
      labelKey: "label",
      valueKey: "value"
    }
  };
};

const buildActionTimelineChart = (
  rows: GideonRuntimeAction[],
  title: string,
  templateId: string
): GideonPanelChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const buckets = new Map<string, number>();
  for (const row of rows) {
    const label = String(row.label || "Action").trim() || "Action";
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }

  const data = Array.from(buckets.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);

  return {
    id: `actions-${String(rows[rows.length - 1]?.id || "chart")}`,
    template: templateId,
    title,
    data,
    config: {
      xKey: "label",
      yKey: "count"
    }
  };
};

const buildPriceActionChart = (
  rows: GideonRuntimeCandle[],
  title: string,
  points: number,
  templateId: string
): GideonPanelChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const data = takeTail(rows, points).map((row) => ({
    x: formatTimeLabel(row.time),
    close: Number(row.close.toFixed(4)),
    high: Number(row.high.toFixed(4)),
    low: Number(row.low.toFixed(4)),
    volume: Number(toNumber(row.volume, 0).toFixed(2))
  }));

  return {
    id: `price-${rows[rows.length - 1]?.time ?? "chart"}`,
    template: templateId,
    title,
    subtitle: `${rows.length} candles`,
    data,
    config: {
      xKey: "x",
      yKey: "close",
      yKeyHigh: "high",
      yKeyLow: "low"
    }
  };
};

const buildCandleTemplateChart = (
  rows: GideonRuntimeCandle[],
  title: string,
  points: number,
  templateId: string
): GideonPanelChart | null => {
  if (STATIC_PRICE_ACTION_TEMPLATE_SET.has(templateId)) {
    return buildPriceActionChart(rows, title, points, templateId);
  }
  return buildPriceValueSeriesChart(rows, title, points, templateId);
};

const buildPriceValueSeriesChart = (
  rows: GideonRuntimeCandle[],
  title: string,
  points: number,
  templateId: string
): GideonPanelChart | null => {
  if (rows.length === 0) {
    return null;
  }

  const slicedRows = takeTail(rows, points);
  const values = buildDerivedPriceValues(slicedRows, templateId);
  if (values.length === 0) {
    return null;
  }

  const data = slicedRows.map((row, index) => ({
    x: formatTimeLabel(row.time),
    value: Number((values[index] ?? 0).toFixed(6)),
    close: Number(row.close.toFixed(6))
  }));

  return {
    id: `series-${templateId}-${slicedRows[slicedRows.length - 1]?.time ?? "chart"}`,
    template: templateId,
    title,
    subtitle: `${rows.length} candles`,
    data,
    config: {
      xKey: "x",
      yKey: "value"
    }
  };
};

export const resolveGraphTemplateTool = (params: {
  requestedGraphTemplate: string | null;
  fallbackTemplate?: string | null;
}) => {
  const direct = String(params.requestedGraphTemplate || "").trim().toLowerCase();
  const fallback = String(params.fallbackTemplate || "").trim().toLowerCase();

  if (direct && GRAPH_TEMPLATE_ID_SET.has(direct)) {
    const template = resolveGraphTemplate(direct);
    return {
      templateId: template.id,
      family: template.family,
      mode: template.mode,
      title: template.title,
      source: "direct"
    };
  }

  if (fallback && GRAPH_TEMPLATE_ID_SET.has(fallback)) {
    const template = resolveGraphTemplate(fallback);
    return {
      templateId: template.id,
      family: template.family,
      mode: template.mode,
      title: template.title,
      source: "fallback"
    };
  }

  const template = resolveGraphTemplate("price_action");
  return {
    templateId: template.id,
    family: template.family,
    mode: template.mode,
    title: template.title,
    source: "default"
  };
};

export const buildPanelChartTool = (params: {
  runtime: GideonRuntimeContext;
  templateId?: string | null;
  title?: string | null;
  points?: number;
  candles?: GideonRuntimeCandle[] | null;
  source?: "history" | "backtest" | "candles" | "clickhouse";
}) => {
  const resolvedTemplate = resolveGraphTemplateTool({
    requestedGraphTemplate: params.templateId ?? null,
    fallbackTemplate: "price_action"
  });
  const points = clamp(toNumber(params.points, 260), 40, 1000);
  const title = String(params.title || resolvedTemplate.title).trim() || resolvedTemplate.title;
  const candleRows = selectRecentWindowCandles({
    runtime: params.runtime,
    candles: params.candles
  });
  const prefersBacktest = params.source === "backtest";
  const tradeRows =
    prefersBacktest && params.runtime.backtestRows.length > 0
      ? params.runtime.backtestRows
      : params.runtime.historyRows.length > 0
        ? params.runtime.historyRows
        : params.runtime.backtestRows;

  let chart: GideonPanelChart | null = null;
  if (resolvedTemplate.family === "equity_curve") {
    chart = buildEquityCurveChart(tradeRows, title, points, resolvedTemplate.templateId);
  } else if (resolvedTemplate.family === "pnl_distribution") {
    chart = buildPnlDistributionChart(tradeRows, title, resolvedTemplate.templateId);
  } else if (resolvedTemplate.family === "session_performance") {
    chart = buildSessionPerformanceChart(tradeRows, title, resolvedTemplate.templateId);
  } else if (resolvedTemplate.family === "trade_outcomes") {
    chart = buildTradeOutcomeChart(tradeRows, title, resolvedTemplate.templateId);
  } else {
    chart = STATIC_PRICE_ACTION_TEMPLATE_SET.has(resolvedTemplate.templateId)
      ? buildPriceActionChart(candleRows, title, points, resolvedTemplate.templateId)
      : buildPriceValueSeriesChart(candleRows, title, points, resolvedTemplate.templateId);
  }

  if (chart) {
    chart.mode = resolvedTemplate.mode;
  }

  return {
    chart,
    templateId: resolvedTemplate.templateId,
    family: resolvedTemplate.family,
    mode: resolvedTemplate.mode,
    source: resolvedTemplate.family === "price_action" ? "candles" : tradeRows === params.runtime.backtestRows ? "backtest" : "history"
  };
};

export const buildChartsFromPlansTool = (params: {
  plans: GideonChartPlan[];
  runtime: GideonRuntimeContext;
  candles?: GideonRuntimeCandle[] | null;
}): GideonPanelChart[] => {
  const charts: GideonPanelChart[] = [];
  const clickhouseCandles = params.candles ?? [];
  const recentWindowRows = selectRecentWindowCandles({
    runtime: params.runtime,
    candles: clickhouseCandles
  });
  const actionRows = params.runtime.actionRows ?? [];

  for (const plan of params.plans) {
    const points = clamp(toNumber(plan.points, 220), 40, 1000);
    const resolvedTemplate = resolveGraphTemplate(plan.template);
    const templateId = resolvedTemplate.id;
    const chartTitle = String(plan.title || resolvedTemplate.title).trim() || resolvedTemplate.title;

    let chart: GideonPanelChart | null = null;

    if (resolvedTemplate.family === "equity_curve") {
      const sourceRows =
        plan.source === "backtest" && params.runtime.backtestRows.length > 0
          ? params.runtime.backtestRows
          : params.runtime.historyRows.length > 0
            ? params.runtime.historyRows
            : params.runtime.backtestRows;
      chart = buildEquityCurveChart(sourceRows, chartTitle, points, templateId);
    } else if (resolvedTemplate.family === "pnl_distribution") {
      const sourceRows =
        plan.source === "backtest" && params.runtime.backtestRows.length > 0
          ? params.runtime.backtestRows
          : params.runtime.historyRows.length > 0
            ? params.runtime.historyRows
            : params.runtime.backtestRows;
      chart = buildPnlDistributionChart(sourceRows, chartTitle, templateId);
    } else if (resolvedTemplate.family === "session_performance") {
      const sourceRows =
        plan.source === "backtest" && params.runtime.backtestRows.length > 0
          ? params.runtime.backtestRows
          : params.runtime.historyRows.length > 0
            ? params.runtime.historyRows
            : params.runtime.backtestRows;
      chart = buildSessionPerformanceChart(sourceRows, chartTitle, templateId);
    } else if (resolvedTemplate.family === "trade_outcomes") {
      const sourceRows =
        plan.source === "backtest" && params.runtime.backtestRows.length > 0
          ? params.runtime.backtestRows
          : params.runtime.historyRows.length > 0
            ? params.runtime.historyRows
            : params.runtime.backtestRows;
      chart = buildTradeOutcomeChart(sourceRows, chartTitle, templateId);
    } else if (resolvedTemplate.family === "price_action") {
      const sourceRows =
        plan.source === "clickhouse" && clickhouseCandles.length > 0
          ? recentWindowRows
          : params.runtime.liveCandles.length > 0
            ? params.runtime.liveCandles
            : recentWindowRows;
      chart = buildCandleTemplateChart(sourceRows, chartTitle, points, templateId);
    } else if (resolvedTemplate.family === "action_timeline") {
      chart = buildActionTimelineChart(actionRows, chartTitle, templateId);
    }

    if (chart && chart.data.length > 0) {
      chart.mode = resolvedTemplate.mode;
      charts.push(chart);
    }
  }

  const uniqueByTemplate = new Map<string, GideonPanelChart>();
  for (const chart of charts) {
    if (!uniqueByTemplate.has(chart.template)) {
      uniqueByTemplate.set(chart.template, chart);
    }
  }

  return Array.from(uniqueByTemplate.values()).slice(0, 3);
};

export const buildStrategyPreviewChartsTool = (params: {
  runtime: GideonRuntimeContext;
  matchedModelId: string;
  matchedModelName: string;
  candles?: GideonRuntimeCandle[] | null;
}): GideonPanelChart[] => {
  const candles = takeTail(params.candles ?? params.runtime.liveCandles, 140);
  if (candles.length < 20) {
    return [];
  }

  let secondaryTemplate = "close_with_range";
  let secondaryTitle = "Range Context";

  if (params.matchedModelId === "momentum") {
    secondaryTemplate = "ema_20";
    secondaryTitle = "Trend Filter";
  } else if (params.matchedModelId === "mean-reversion") {
    secondaryTemplate = "rsi_14";
    secondaryTitle = "Stretch Meter";
  } else if (params.matchedModelId === "fibonacci") {
    secondaryTemplate = "range_expansion";
    secondaryTitle = "Swing Range";
  } else if (params.matchedModelId === "support-resistance") {
    secondaryTemplate = "close_with_range";
    secondaryTitle = "Level Context";
  }

  const primary = buildPriceActionChart(
    candles,
    `${params.matchedModelName} Preview`,
    140,
    "price_action"
  );
  const secondary = buildCandleTemplateChart(
    candles,
    secondaryTitle,
    140,
    secondaryTemplate
  );

  const charts = [primary, secondary]
    .filter((chart): chart is GideonPanelChart => chart !== null)
    .slice(0, 2);

  for (const chart of charts) {
    chart.mode = resolveGraphTemplate(chart.template).mode;
  }

  return charts;
};
