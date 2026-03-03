import { normalizeChartActions, type AssistantChartAction } from "./chartActions";

export type AssistantChartAnimationTheme = "neutral" | "bullish" | "bearish" | "gold";

export type AssistantChartAnimationStep = {
  id: string;
  atMs: number;
  holdMs: number;
  label: string;
  narration?: string;
  actions: AssistantChartAction[];
};

export type AssistantChartAnimation = {
  id: string;
  title: string;
  summary: string;
  thumbnailTitle: string;
  thumbnailSubtitle: string;
  theme: AssistantChartAnimationTheme;
  durationMs: number;
  steps: AssistantChartAnimationStep[];
};

type AnimationCodingOutput = {
  chartAnimations?: Array<Record<string, unknown>>;
};

const MAX_ANIMATIONS = 3;
const MAX_STEPS = 30;

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
};

const normalizeTheme = (value: unknown): AssistantChartAnimationTheme => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bullish" || normalized === "bearish" || normalized === "gold") {
    return normalized;
  }
  return "neutral";
};

const actionLabel = (action: AssistantChartAction): string => {
  if (action.type === "draw_support_resistance") {
    return "Support and resistance";
  }
  if (action.type === "draw_horizontal_line") {
    return "Horizontal level";
  }
  if (action.type === "draw_vertical_line") {
    return "Vertical marker";
  }
  if (action.type === "draw_trend_line") {
    return "Trend line";
  }
  if (action.type === "draw_box") {
    return "Price zone";
  }
  if (action.type === "draw_fvg") {
    return "Fair value gap";
  }
  if (action.type === "draw_arrow") {
    return "Signal marker";
  }
  if (action.type === "draw_long_position") {
    return "Long setup";
  }
  if (action.type === "draw_short_position") {
    return "Short setup";
  }
  if (action.type === "draw_ruler") {
    return "Range measurement";
  }
  if (action.type === "mark_candlestick") {
    return "Candle mark";
  }
  if (action.type === "move_to_date") {
    return "Pan to date";
  }
  if (action.type === "clear_annotations") {
    return "Clear previous drawing";
  }
  return "Chart action";
};

const dedupeAnimationId = (rawId: string, index: number): string => {
  const normalized = rawId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length > 0) {
    return normalized;
  }

  return `chart-animation-${index + 1}`;
};

export const normalizeChartAnimations = (
  input: unknown
): AssistantChartAnimation[] => {
  const raw = Array.isArray(input) ? input : [];
  const output: AssistantChartAnimation[] = [];
  const usedIds = new Set<string>();

  for (let index = 0; index < raw.length; index += 1) {
    const row = raw[index];
    if (!row || typeof row !== "object") {
      continue;
    }

    const item = row as Record<string, unknown>;
    const title = toText(item.title, "Chart Animation");
    const summary = toText(item.summary, "Step-by-step chart walkthrough.");
    const thumbnailTitle = toText(item.thumbnailTitle, title);
    const thumbnailSubtitle = toText(item.thumbnailSubtitle, "Tap to play");
    const theme = normalizeTheme(item.theme);
    const stepsRaw = Array.isArray(item.steps) ? item.steps : [];

    const steps: AssistantChartAnimationStep[] = [];
    for (let stepIndex = 0; stepIndex < stepsRaw.length; stepIndex += 1) {
      const stepRow = stepsRaw[stepIndex];
      if (!stepRow || typeof stepRow !== "object") {
        continue;
      }

      const stepItem = stepRow as Record<string, unknown>;
      const actions = normalizeChartActions(stepItem.actions);
      if (actions.length === 0) {
        continue;
      }

      const atMs = clamp(toNumber(stepItem.atMs, stepIndex * 900), 0, 180_000);
      const holdMs = clamp(toNumber(stepItem.holdMs, 560), 120, 5000);
      const label =
        toText(stepItem.label, "") || actions.map(actionLabel).slice(0, 2).join(" + ");

      steps.push({
        id: dedupeAnimationId(toText(stepItem.id, `step-${stepIndex + 1}`), stepIndex),
        atMs,
        holdMs,
        label: label || "Chart step",
        narration: toText(stepItem.narration, ""),
        actions
      });
    }

    if (steps.length === 0) {
      continue;
    }

    steps.sort((left, right) => left.atMs - right.atMs);
    const limitedSteps = steps.slice(0, MAX_STEPS);
    const last = limitedSteps[limitedSteps.length - 1]!;
    const durationMs = clamp(
      toNumber(item.durationMs, last.atMs + last.holdMs + 420),
      last.atMs + 240,
      240_000
    );

    let id = dedupeAnimationId(toText(item.id, title), index);
    if (usedIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    usedIds.add(id);

    output.push({
      id,
      title,
      summary,
      thumbnailTitle,
      thumbnailSubtitle,
      theme,
      durationMs,
      steps: limitedSteps
    });
  }

  return output.slice(0, MAX_ANIMATIONS);
};

export const buildFallbackChartAnimation = (params: {
  title?: string;
  summary?: string;
  actions: unknown;
  theme?: AssistantChartAnimationTheme;
}): AssistantChartAnimation | null => {
  const actions = normalizeChartActions(params.actions);
  if (actions.length === 0) {
    return null;
  }

  const steps: AssistantChartAnimationStep[] = actions.map((action, index) => ({
    id: `step-${index + 1}`,
    atMs: index * 920,
    holdMs: 560,
    label: actionLabel(action),
    narration: "",
    actions: [action]
  }));

  const title = toText(params.title, "Chart Walkthrough");
  const summary = toText(
    params.summary,
    "Sequential playback showing each chart annotation step."
  );

  const last = steps[steps.length - 1]!;

  return {
    id: `fallback-${Date.now()}`,
    title,
    summary,
    thumbnailTitle: title,
    thumbnailSubtitle: `${steps.length} steps`,
    theme: params.theme ?? "neutral",
    durationMs: last.atMs + last.holdMs + 420,
    steps
  };
};

export const chartAnimationsPromptSpec = (): string => {
  return [
    "Chart animation JSON shape:",
    '{"chartAnimations":[{"id":string,"title":string,"summary":string,"thumbnailTitle":string,"thumbnailSubtitle":string,"theme":"neutral|bullish|bearish|gold","durationMs":number,"steps":[{"id":string,"atMs":number,"holdMs":number,"label":string,"narration":string,"actions":[chartAction]}]}]}',
    "Use chartAnimations only when the user asks for animation/video/replay/demo.",
    "Animation should be concise and smooth: 3-14 steps.",
    "Each step should usually have 1-3 actions.",
    "Example:",
    '{"chartAnimations":[{"id":"sr-demo","title":"Support / Resistance Walkthrough","summary":"Replay of key levels and confirmation markers.","thumbnailTitle":"S/R Replay","thumbnailSubtitle":"6 steps","theme":"gold","steps":[{"id":"s1","atMs":0,"holdMs":600,"label":"Clear previous tools","actions":[{"type":"clear_annotations"}]},{"id":"s2","atMs":900,"holdMs":700,"label":"Draw support/resistance","actions":[{"type":"draw_support_resistance","priceStart":3330,"priceEnd":3360}]},{"id":"s3","atMs":1900,"holdMs":700,"label":"Mark rejection","actions":[{"type":"draw_arrow","time":1709251200000,"price":3358,"markerShape":"arrowDown","label":"Rejection"}]}]}]}'
  ].join("\n");
};

export const normalizeChartAnimationsFromCoding = (
  parsed: Record<string, unknown>
): AssistantChartAnimation[] => {
  return normalizeChartAnimations((parsed as AnimationCodingOutput).chartAnimations);
};
