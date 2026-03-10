import momentumModel from "../data/models/momentum.json";
import meanReversionModel from "../data/models/mean-reversion.json";
import seasonsModel from "../data/models/seasons.json";
import timeOfDayModel from "../data/models/time-of-day.json";
import fibonacciModel from "../data/models/fibonacci.json";
import fairValueGapModel from "../data/models/fair-value-gap.json";
import supportResistanceModel from "../data/models/support-resistance.json";

export type StrategyModelKind =
  | "momentum"
  | "meanReversion"
  | "seasons"
  | "timeOfDay"
  | "fibonacci"
  | "fairValueGap"
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

export type StrategyBacktestLiteral = string | number | boolean | null;

export type StrategyBacktestCondition =
  | {
      feature: string;
    }
  | {
      not: StrategyBacktestCondition;
    }
  | {
      all: StrategyBacktestCondition[];
    }
  | {
      any: StrategyBacktestCondition[];
    }
  | {
      eq: [string, StrategyBacktestLiteral];
    }
  | {
      neq: [string, StrategyBacktestLiteral];
    };

export type StrategyBacktestCheck = {
  label: string;
  when: StrategyBacktestCondition;
};

export type StrategyBacktestDirectionalChecks = {
  checks: StrategyBacktestCheck[];
};

export type StrategyBacktestSpec = {
  source?: string;
  entry: {
    long: StrategyBacktestDirectionalChecks;
    short: StrategyBacktestDirectionalChecks;
  };
  exit?: {
    long?: StrategyBacktestDirectionalChecks;
    short?: StrategyBacktestDirectionalChecks;
  };
};

export type StrategyModelCatalogEntry = {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  entry: StrategyEntrySpec;
  exit: StrategyExitSpec;
  backtest?: StrategyBacktestSpec;
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

export type StrategyBacktestFeatureGuide = {
  feature: string;
  description: string;
};

const MODEL_SOURCES = [
  momentumModel,
  meanReversionModel,
  seasonsModel,
  timeOfDayModel,
  fibonacciModel,
  fairValueGapModel,
  supportResistanceModel
] as const;

const MODEL_KIND_BY_ID: Record<string, StrategyModelKind> = {
  momentum: "momentum",
  "mean-reversion": "meanReversion",
  seasons: "seasons",
  "time-of-day": "timeOfDay",
  fibonacci: "fibonacci",
  "fair-value-gap": "fairValueGap",
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
  fairValueGap: {
    riskMin: 0.0011,
    riskMax: 0.0038,
    rrMin: 1.6,
    rrMax: 3.2,
    longBias: 0.52,
    winRate: 0.57
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
  fairValueGap: [],
  supportResistance: [
    "Which level type matters here: daily, weekly, session, or intraday structure?",
    "Are you trading the rejection, the reclaim, or the breakout hold?",
    "What acceptance through the zone forces an immediate exit?"
  ]
};

export const STRATEGY_BACKTEST_FEATURE_GUIDE: readonly StrategyBacktestFeatureGuide[] = [
  { feature: "upTrendBase", description: "30 EMA is above the 200 EMA." },
  { feature: "downTrendBase", description: "30 EMA is below the 200 EMA." },
  {
    feature: "upPrice",
    description: "Recent price already printed an upside impulse versus the last 6 bars."
  },
  {
    feature: "downPrice",
    description: "Recent price already printed a downside impulse versus the last 6 bars."
  },
  { feature: "recentUp", description: "An upside impulse printed within the last 10 bars." },
  { feature: "recentDown", description: "A downside impulse printed within the last 10 bars." },
  { feature: "normDown", description: "Normalized oscillator is below 40." },
  { feature: "normUp", description: "Normalized oscillator is above 60." },
  {
    feature: "seasonBucket",
    description: "Market season classification: spring, summer, fall, or winter."
  },
  {
    feature: "prevSeasonBucket",
    description: "Previous bar's market season classification."
  },
  { feature: "timeBucket", description: "Momentum time bucket: day or night." },
  { feature: "prevTimeBucket", description: "Previous bar's momentum time bucket." },
  {
    feature: "nearSupport",
    description: "Close is near the lower part of the recent chunk range."
  },
  {
    feature: "nearResistance",
    description: "Close is near the upper part of the recent chunk range."
  },
  {
    feature: "bullishReversal",
    description: "Latest close shows a bullish reversal versus the prior close."
  },
  {
    feature: "bearishReversal",
    description: "Latest close shows a bearish reversal versus the prior close."
  },
  {
    feature: "sufficientRange",
    description: "Recent chunk range is large enough to avoid compressed conditions."
  },
  {
    feature: "bullishFvgRetest",
    description: "A recent bullish fair value gap was revisited and held above its midpoint."
  },
  {
    feature: "bearishFvgRetest",
    description: "A recent bearish fair value gap was revisited and held below its midpoint."
  }
] as const;

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

const sanitizeStrategyTextList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const isStrategyBacktestLiteral = (value: unknown): value is StrategyBacktestLiteral => {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
};

export const parseStrategyBacktestCondition = (
  value: unknown
): StrategyBacktestCondition | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  if (typeof value.feature === "string" && value.feature.trim().length > 0) {
    return {
      feature: value.feature.trim()
    };
  }

  if ("not" in value) {
    const parsed = parseStrategyBacktestCondition(value.not);
    return parsed ? { not: parsed } : null;
  }

  if ("all" in value && Array.isArray(value.all)) {
    const parsed = value.all.map((item) => parseStrategyBacktestCondition(item));
    return parsed.every((item) => item !== null)
      ? { all: parsed as StrategyBacktestCondition[] }
      : null;
  }

  if ("any" in value && Array.isArray(value.any)) {
    const parsed = value.any.map((item) => parseStrategyBacktestCondition(item));
    return parsed.every((item) => item !== null)
      ? { any: parsed as StrategyBacktestCondition[] }
      : null;
  }

  if ("eq" in value && Array.isArray(value.eq) && value.eq.length === 2) {
    const [feature, literal] = value.eq;
    if (
      typeof feature === "string" &&
      feature.trim().length > 0 &&
      isStrategyBacktestLiteral(literal)
    ) {
      return {
        eq: [feature.trim(), literal]
      };
    }
  }

  if ("neq" in value && Array.isArray(value.neq) && value.neq.length === 2) {
    const [feature, literal] = value.neq;
    if (
      typeof feature === "string" &&
      feature.trim().length > 0 &&
      isStrategyBacktestLiteral(literal)
    ) {
      return {
        neq: [feature.trim(), literal]
      };
    }
  }

  return null;
};

export const parseStrategyBacktestChecks = (value: unknown): StrategyBacktestCheck[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const checks: StrategyBacktestCheck[] = [];

  for (const item of value) {
    if (!isPlainRecord(item)) {
      return null;
    }

    const label = typeof item.label === "string" ? item.label.trim() : "";
    const when = parseStrategyBacktestCondition(item.when);

    if (!label || !when) {
      return null;
    }

    checks.push({ label, when });
  }

  return checks;
};

export const parseStrategyBacktestDirectionalChecks = (
  value: unknown
): StrategyBacktestDirectionalChecks | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  const checks = parseStrategyBacktestChecks(value.checks);
  return checks ? { checks } : null;
};

export const parseStrategyBacktestSpec = (value: unknown): StrategyBacktestSpec | null => {
  if (!isPlainRecord(value) || !isPlainRecord(value.entry)) {
    return null;
  }

  const long = parseStrategyBacktestDirectionalChecks(value.entry.long);
  const short = parseStrategyBacktestDirectionalChecks(value.entry.short);

  if (!long || !short) {
    return null;
  }

  let exit: StrategyBacktestSpec["exit"];
  if (value.exit != null) {
    if (!isPlainRecord(value.exit)) {
      return null;
    }

    const parsedLongExit =
      value.exit.long == null ? undefined : parseStrategyBacktestDirectionalChecks(value.exit.long);
    const parsedShortExit =
      value.exit.short == null ? undefined : parseStrategyBacktestDirectionalChecks(value.exit.short);

    if (
      (value.exit.long != null && !parsedLongExit) ||
      (value.exit.short != null && !parsedShortExit)
    ) {
      return null;
    }

    exit = {
      long: parsedLongExit ?? undefined,
      short: parsedShortExit ?? undefined
    };
  }

  const source = typeof value.source === "string" ? value.source.trim() : undefined;

  return {
    source,
    entry: {
      long,
      short
    },
    exit
  };
};

export const parseStrategyModelCatalogEntry = (
  value: unknown
): StrategyModelCatalogEntry | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  const record = value;
  const entryRecord = isPlainRecord(record.entry) ? record.entry : {};
  const exitRecord = isPlainRecord(record.exit) ? record.exit : {};
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const backtest = record.backtest == null ? undefined : parseStrategyBacktestSpec(record.backtest);

  if (!id || !name || (record.backtest != null && !backtest)) {
    return null;
  }

  const entry = {
    context: sanitizeStrategyTextList(entryRecord.context),
    setup: sanitizeStrategyTextList(entryRecord.setup),
    trigger: sanitizeStrategyTextList(entryRecord.trigger),
    confirmation: sanitizeStrategyTextList(entryRecord.confirmation),
    invalidation: sanitizeStrategyTextList(entryRecord.invalidation),
    noTrade: sanitizeStrategyTextList(entryRecord.noTrade)
  };
  const exit = {
    stopLoss: sanitizeStrategyTextList(exitRecord.stopLoss),
    takeProfit: sanitizeStrategyTextList(exitRecord.takeProfit),
    timeExit: sanitizeStrategyTextList(exitRecord.timeExit),
    earlyExit: sanitizeStrategyTextList(exitRecord.earlyExit)
  };
  const hasEntryText = Object.values(entry).some((items) => items.length > 0);

  if (!hasEntryText && !backtest) {
    return null;
  }

  return {
    id,
    name,
    aliases: sanitizeStrategyTextList(record.aliases),
    description,
    entry,
    exit,
    ...(backtest ? { backtest } : {})
  };
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

export const buildStrategyBacktestFeaturePromptContext = (): string => {
  return STRATEGY_BACKTEST_FEATURE_GUIDE.map(
    (item) => `- ${item.feature}: ${item.description}`
  ).join("\n");
};
