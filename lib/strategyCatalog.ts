import momentumModel from "../data/models/momentum.json";
import meanReversionModel from "../data/models/mean-reversion.json";
import seasonsModel from "../data/models/seasons.json";
import timeOfDayModel from "../data/models/time-of-day.json";
import fibonacciModel from "../data/models/fibonacci.json";
import supportResistanceModel from "../data/models/support-resistance.json";

export type StrategyModelKind =
  | "momentum"
  | "meanReversion"
  | "seasons"
  | "timeOfDay"
  | "fibonacci"
  | "supportResistance";

export type StrategyEntrySpec = {
  context: string[];
  setup: string[];
  trigger: string[];
  confirmation: string[];
  invalidation: string[];
  noTrade: string[];
};

export type StrategyExitSpec = {
  stopLoss: string[];
  takeProfit: string[];
  timeExit: string[];
  earlyExit: string[];
};

export type StrategyModelCatalogEntry = {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  entry: StrategyEntrySpec;
  exit: StrategyExitSpec;
};

export type StrategyRuntimeModelProfile = {
  id: string;
  name: string;
  modelKind: StrategyModelKind;
  riskMin: number;
  riskMax: number;
  rrMin: number;
  rrMax: number;
  longBias: number;
  winRate: number;
};

const MODEL_SOURCES = [
  momentumModel,
  meanReversionModel,
  seasonsModel,
  timeOfDayModel,
  fibonacciModel,
  supportResistanceModel
] as const;

const MODEL_KIND_BY_ID: Record<string, StrategyModelKind> = {
  momentum: "momentum",
  "mean-reversion": "meanReversion",
  seasons: "seasons",
  "time-of-day": "timeOfDay",
  fibonacci: "fibonacci",
  "support-resistance": "supportResistance"
};

const MODEL_RUNTIME_DEFAULTS: Record<
  StrategyModelKind,
  Omit<StrategyRuntimeModelProfile, "id" | "name" | "modelKind">
> = {
  momentum: {
    riskMin: 0.0014,
    riskMax: 0.0044,
    rrMin: 1.45,
    rrMax: 3.1,
    longBias: 0.56,
    winRate: 0.58
  },
  meanReversion: {
    riskMin: 0.0011,
    riskMax: 0.0036,
    rrMin: 1.2,
    rrMax: 2.4,
    longBias: 0.5,
    winRate: 0.6
  },
  seasons: {
    riskMin: 0.0013,
    riskMax: 0.004,
    rrMin: 1.35,
    rrMax: 2.5,
    longBias: 0.52,
    winRate: 0.54
  },
  timeOfDay: {
    riskMin: 0.0012,
    riskMax: 0.0038,
    rrMin: 1.25,
    rrMax: 2.35,
    longBias: 0.5,
    winRate: 0.57
  },
  fibonacci: {
    riskMin: 0.0012,
    riskMax: 0.0039,
    rrMin: 1.4,
    rrMax: 2.8,
    longBias: 0.53,
    winRate: 0.56
  },
  supportResistance: {
    riskMin: 0.0013,
    riskMax: 0.0042,
    rrMin: 1.35,
    rrMax: 2.7,
    longBias: 0.52,
    winRate: 0.59
  }
};

const MODEL_CLARIFYING_QUESTIONS: Record<StrategyModelKind, string[]> = {
  momentum: [
    "Which timeframe defines the breakout or retest trigger?",
    "What exact close or candle behavior confirms continuation for you?",
    "What price behavior makes you exit before the breakout fails?"
  ],
  meanReversion: [
    "How do you define overextended: structure, VWAP distance, or another stretch measure?",
    "What reclaim or rejection confirms the fade entry?",
    "What tells you the extreme is failing instead of continuing?"
  ],
  seasons: [
    "Which seasonal pattern are you relying on: session, weekday, or monthly behavior?",
    "What current price structure must confirm that cycle before entry?",
    "When does the seasonal window end so the trade must be closed?"
  ],
  timeOfDay: [
    "What exact session window triggers the setup?",
    "Is the entry a breakout of the opening range or a reclaim after a sweep?",
    "What is the hard time-based exit if nothing develops?"
  ],
  fibonacci: [
    "Which swing anchors define the Fibonacci leg?",
    "What level or confluence do you need before entry is valid?",
    "What price action tells you the pullback has failed and the trade is over?"
  ],
  supportResistance: [
    "Which level type matters here: daily, weekly, session, or intraday structure?",
    "Are you trading the rejection, the reclaim, or the breakout hold?",
    "What acceptance through the zone forces an immediate exit?"
  ]
};

export const STRATEGY_MODEL_CATALOG = MODEL_SOURCES as readonly StrategyModelCatalogEntry[];
export const DEFAULT_STRATEGY_MODEL_NAMES = STRATEGY_MODEL_CATALOG.map((entry) => entry.name);

const normalizeLookupKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const modelCatalogLookup = new Map<string, StrategyModelCatalogEntry>();

for (const entry of STRATEGY_MODEL_CATALOG) {
  modelCatalogLookup.set(normalizeLookupKey(entry.id), entry);
  modelCatalogLookup.set(normalizeLookupKey(entry.name), entry);
  for (const alias of entry.aliases) {
    modelCatalogLookup.set(normalizeLookupKey(alias), entry);
  }
}

export const resolveStrategyModelCatalogEntry = (
  value: string
): StrategyModelCatalogEntry | null => {
  const key = normalizeLookupKey(value);

  if (!key) {
    return null;
  }

  return modelCatalogLookup.get(key) ?? null;
};

const resolveStrategyModelKind = (modelId: string): StrategyModelKind | null => {
  return MODEL_KIND_BY_ID[modelId] ?? null;
};

export const resolveStrategyRuntimeModelProfile = (
  value: string
): StrategyRuntimeModelProfile | null => {
  const model = resolveStrategyModelCatalogEntry(value);

  if (!model) {
    return null;
  }

  const modelKind = resolveStrategyModelKind(model.id);

  if (!modelKind) {
    return null;
  }

  return {
    id: model.id,
    name: model.name,
    modelKind,
    ...MODEL_RUNTIME_DEFAULTS[modelKind]
  };
};

export const buildStrategyClarifyingQuestions = (value: string): string[] => {
  const model = resolveStrategyModelCatalogEntry(value);

  if (!model) {
    return [
      "Which timeframe defines the entry trigger?",
      "What exact price behavior confirms the setup?",
      "What price event forces the exit before target?"
    ];
  }

  const modelKind = resolveStrategyModelKind(model.id);

  if (!modelKind) {
    return [
      "Which timeframe defines the entry trigger?",
      "What exact price behavior confirms the setup?",
      "What price event forces the exit before target?"
    ];
  }

  return MODEL_CLARIFYING_QUESTIONS[modelKind];
};

const previewList = (values: readonly string[], limit = 2): string => {
  return values.slice(0, limit).join("; ");
};

export const buildStrategyCatalogPromptContext = (): string => {
  return STRATEGY_MODEL_CATALOG.map((model) => {
    return [
      `Model ${model.name} [${model.id}]`,
      `Description: ${model.description}`,
      `Entry context: ${previewList(model.entry.context, 2)}`,
      `Entry trigger: ${previewList(model.entry.trigger, 2)}`,
      `Entry confirmation: ${previewList(model.entry.confirmation, 2)}`,
      `Entry invalidation: ${previewList(model.entry.invalidation, 2)}`,
      `Exit stop: ${previewList(model.exit.stopLoss, 2)}`,
      `Exit take profit: ${previewList(model.exit.takeProfit, 2)}`,
      `Exit time: ${previewList(model.exit.timeExit, 2)}`,
      `Exit early: ${previewList(model.exit.earlyExit, 2)}`
    ].join("\n");
  }).join("\n\n");
};
