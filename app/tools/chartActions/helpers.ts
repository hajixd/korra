import type { LineStyle } from "lightweight-charts";
import type { ChartActionRuntimeContext } from "./types";

const LIGHTWEIGHT_CHART_LINE_SOLID: LineStyle = 0;
const LIGHTWEIGHT_CHART_LINE_DOTTED: LineStyle = 1;
const LIGHTWEIGHT_CHART_LINE_DASHED: LineStyle = 2;

export const styleToLineStyle = (style?: "solid" | "dashed" | "dotted"): LineStyle => {
  if (style === "dotted") {
    return LIGHTWEIGHT_CHART_LINE_DOTTED;
  }

  if (style === "dashed") {
    return LIGHTWEIGHT_CHART_LINE_DASHED;
  }

  return LIGHTWEIGHT_CHART_LINE_SOLID;
};

export const chartPriceBounds = (ctx: ChartActionRuntimeContext): { min: number; max: number } => {
  if (ctx.candles.length === 0) {
    return { min: 0, max: 1 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const candle of ctx.candles) {
    min = Math.min(min, candle.low, candle.open, candle.close);
    max = Math.max(max, candle.high, candle.open, candle.close);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { min: 0, max: Math.max(1, max || 1) };
  }

  const padding = (max - min) * 0.04;
  return {
    min: min - padding,
    max: max + padding
  };
};

export const clampPrice = (value: number, bounds: { min: number; max: number }): number => {
  if (!Number.isFinite(value)) {
    return bounds.min;
  }

  return Math.max(bounds.min, Math.min(bounds.max, value));
};

export const pickColor = (value: string | undefined, fallback: string): string => {
  const text = String(value || "").trim();
  return text.length > 0 ? text : fallback;
};
