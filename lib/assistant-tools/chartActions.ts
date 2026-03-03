export type AssistantChartActionType =
  | "clear_annotations"
  | "move_to_date"
  | "draw_horizontal_line"
  | "draw_vertical_line"
  | "draw_trend_line"
  | "draw_box"
  | "draw_fvg"
  | "draw_support_resistance"
  | "draw_arrow"
  | "draw_long_position"
  | "draw_short_position"
  | "draw_ruler"
  | "mark_candlestick";

export type AssistantChartAction = {
  type: AssistantChartActionType;
  label?: string;
  color?: string;
  style?: "solid" | "dashed" | "dotted";
  time?: number;
  timeStart?: number;
  timeEnd?: number;
  price?: number;
  priceStart?: number;
  priceEnd?: number;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  side?: "long" | "short";
  markerShape?: "arrowUp" | "arrowDown" | "circle" | "square";
  note?: string;
};

const ACTION_TYPES: AssistantChartActionType[] = [
  "clear_annotations",
  "move_to_date",
  "draw_horizontal_line",
  "draw_vertical_line",
  "draw_trend_line",
  "draw_box",
  "draw_fvg",
  "draw_support_resistance",
  "draw_arrow",
  "draw_long_position",
  "draw_short_position",
  "draw_ruler",
  "mark_candlestick"
];

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toText = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const isValidActionType = (value: unknown): value is AssistantChartActionType =>
  typeof value === "string" && ACTION_TYPES.includes(value as AssistantChartActionType);

const sanitizeStyle = (value: unknown): "solid" | "dashed" | "dotted" => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "dashed" || raw === "dotted") {
    return raw;
  }
  return "solid";
};

const sanitizeMarkerShape = (
  value: unknown
): "arrowUp" | "arrowDown" | "circle" | "square" => {
  const raw = String(value || "").trim();
  if (raw === "arrowUp" || raw === "arrowDown" || raw === "circle" || raw === "square") {
    return raw;
  }
  return "arrowUp";
};

const sanitizeSide = (value: unknown): "long" | "short" | undefined => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "long" || raw === "short") {
    return raw;
  }
  return undefined;
};

export const normalizeChartActions = (input: unknown): AssistantChartAction[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const actions: AssistantChartAction[] = [];

  for (const row of input) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const raw = row as Record<string, unknown>;
    if (!isValidActionType(raw.type)) {
      continue;
    }

    const action: AssistantChartAction = {
      type: raw.type,
      label: toText(raw.label, ""),
      color: toText(raw.color, ""),
      style: sanitizeStyle(raw.style),
      time: toNumber(raw.time) ?? undefined,
      timeStart: toNumber(raw.timeStart) ?? undefined,
      timeEnd: toNumber(raw.timeEnd) ?? undefined,
      price: toNumber(raw.price) ?? undefined,
      priceStart: toNumber(raw.priceStart) ?? undefined,
      priceEnd: toNumber(raw.priceEnd) ?? undefined,
      entryPrice: toNumber(raw.entryPrice) ?? undefined,
      stopPrice: toNumber(raw.stopPrice) ?? undefined,
      targetPrice: toNumber(raw.targetPrice) ?? undefined,
      side: sanitizeSide(raw.side),
      markerShape: sanitizeMarkerShape(raw.markerShape),
      note: toText(raw.note, "")
    };

    actions.push(action);
  }

  return actions.slice(0, 24);
};

export const chartActionsPromptSpec = (): string => {
  return [
    "Supported chart actions (JSON array):",
    '{"type":"clear_annotations"}',
    '{"type":"move_to_date","time":1709251200000}',
    '{"type":"draw_horizontal_line","price":3365.2,"label":"Resistance","color":"#f0455a"}',
    '{"type":"draw_vertical_line","time":1709251200000,"label":"Event"}',
    '{"type":"draw_trend_line","timeStart":1709200000000,"priceStart":3340,"timeEnd":1709300000000,"priceEnd":3360}',
    '{"type":"draw_box","timeStart":1709200000000,"priceStart":3338,"timeEnd":1709300000000,"priceEnd":3352,"label":"Range"}',
    '{"type":"draw_fvg","timeStart":1709200000000,"timeEnd":1709300000000,"priceStart":3346,"priceEnd":3351}',
    '{"type":"draw_support_resistance","priceStart":3330,"priceEnd":3360}',
    '{"type":"draw_arrow","time":1709251200000,"price":3355,"markerShape":"arrowDown","label":"Rejection"}',
    '{"type":"draw_long_position","entryPrice":3348,"stopPrice":3339,"targetPrice":3368}',
    '{"type":"draw_short_position","entryPrice":3358,"stopPrice":3367,"targetPrice":3340}',
    '{"type":"draw_ruler","timeStart":1709200000000,"priceStart":3340,"timeEnd":1709300000000,"priceEnd":3360}',
    '{"type":"mark_candlestick","time":1709251200000,"markerShape":"circle","note":"Liquidity sweep"}'
  ].join("\n");
};
