import momentumModel from "../data/models/momentum.json";
import meanReversionModel from "../data/models/mean-reversion.json";
import seasonsModel from "../data/models/seasons.json";
import timeOfDayModel from "../data/models/time-of-day.json";
import fibonacciModel from "../data/models/fibonacci.json";
import supportResistanceModel from "../data/models/support-resistance.json";
import momentumBreakoutStrategy from "../data/strategies/momentum-breakout.json";
import meanReversionFadeStrategy from "../data/strategies/mean-reversion-fade.json";
import seasonalCycleBiasStrategy from "../data/strategies/seasonal-cycle-bias.json";
import sessionFlowStrategy from "../data/strategies/session-flow.json";
import fibonacciPullbackStrategy from "../data/strategies/fibonacci-pullback.json";
import supportResistanceReactionStrategy from "../data/strategies/support-resistance-reaction.json";

export type StrategyModelKind =
  | "momentum"
  | "meanReversion"
  | "seasons"
  | "timeOfDay"
  | "fibonacci"
  | "supportResistance";

export type StrategyModelCatalogEntry = {
  id: string;
  name: string;
  kind: "Model";
  modelKind: StrategyModelKind;
  aliases: string[];
  description: string;
  primaryStrategyId: string;
  risk: {
    minPct: number;
    maxPct: number;
  };
  reward: {
    rrMin: number;
    rrMax: number;
  };
  bias: {
    longBias: number;
    winRate: number;
  };
  preferredSessions: string[];
  preferredTimeframes: string[];
  entryFocus: string[];
  exitFocus: string[];
};

type StrategyPhaseSpec = {
  context: string[];
  setup: string[];
  trigger: string[];
  confirmation: string[];
  invalidation: string[];
  noTrade: string[];
};

type StrategyExitSpec = {
  stopLoss: string[];
  takeProfit: string[];
  management: string[];
  timeExit: string[];
  earlyExit: string[];
};

type StrategyRiskSpec = {
  riskPerTrade: string;
  rrTarget: string;
  maxConcurrentTrades: number;
  sizing: string[];
  exposureLimits: string[];
};

export type StrategyTemplate = {
  id: string;
  modelId: string;
  name: string;
  summary: string;
  marketConditions: string[];
  sessionFocus: string[];
  timeframeBias: string[];
  entry: StrategyPhaseSpec;
  exit: StrategyExitSpec;
  risk: StrategyRiskSpec;
  journaling: string[];
  assistantPrompts: string[];
};

export type StrategyRuntimeModelProfile = {
  id: string;
  name: string;
  modelKind: StrategyModelKind;
  strategyId: string;
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

const STRATEGY_SOURCES = [
  momentumBreakoutStrategy,
  meanReversionFadeStrategy,
  seasonalCycleBiasStrategy,
  sessionFlowStrategy,
  fibonacciPullbackStrategy,
  supportResistanceReactionStrategy
] as const;

export const STRATEGY_MODEL_CATALOG = MODEL_SOURCES as readonly StrategyModelCatalogEntry[];
export const STRATEGY_TEMPLATES = STRATEGY_SOURCES as readonly StrategyTemplate[];
export const DEFAULT_STRATEGY_MODEL_NAMES = STRATEGY_MODEL_CATALOG.map((entry) => entry.name);

const normalizeLookupKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const strategyTemplateById = new Map(STRATEGY_TEMPLATES.map((entry) => [entry.id, entry]));
const modelCatalogLookup = new Map<string, StrategyModelCatalogEntry>();

for (const entry of STRATEGY_MODEL_CATALOG) {
  modelCatalogLookup.set(normalizeLookupKey(entry.id), entry);
  modelCatalogLookup.set(normalizeLookupKey(entry.name), entry);
  for (const alias of entry.aliases) {
    modelCatalogLookup.set(normalizeLookupKey(alias), entry);
  }
}

export const resolveStrategyTemplate = (strategyId: string): StrategyTemplate | null => {
  if (!strategyId) {
    return null;
  }

  return strategyTemplateById.get(strategyId) ?? null;
};

export const resolveStrategyModelCatalogEntry = (
  value: string
): StrategyModelCatalogEntry | null => {
  const key = normalizeLookupKey(value);

  if (!key) {
    return null;
  }

  return modelCatalogLookup.get(key) ?? null;
};

export const resolveStrategyTemplateForModel = (value: string): StrategyTemplate | null => {
  const model = resolveStrategyModelCatalogEntry(value);

  if (!model) {
    return null;
  }

  return resolveStrategyTemplate(model.primaryStrategyId);
};

export const resolveStrategyRuntimeModelProfile = (
  value: string
): StrategyRuntimeModelProfile | null => {
  const model = resolveStrategyModelCatalogEntry(value);

  if (!model) {
    return null;
  }

  return {
    id: model.id,
    name: model.name,
    modelKind: model.modelKind,
    strategyId: model.primaryStrategyId,
    riskMin: model.risk.minPct,
    riskMax: model.risk.maxPct,
    rrMin: model.reward.rrMin,
    rrMax: model.reward.rrMax,
    longBias: model.bias.longBias,
    winRate: model.bias.winRate
  };
};

const previewList = (values: readonly string[], limit = 2): string => {
  return values.slice(0, limit).join("; ");
};

export const buildStrategyCatalogPromptContext = (): string => {
  return STRATEGY_MODEL_CATALOG.map((model) => {
    const strategy = resolveStrategyTemplate(model.primaryStrategyId);
    const lines = [
      `Model ${model.name} [${model.id}]`,
      `Description: ${model.description}`,
      `Risk: ${(model.risk.minPct * 100).toFixed(2)}% to ${(model.risk.maxPct * 100).toFixed(2)}%; RR ${model.reward.rrMin.toFixed(2)} to ${model.reward.rrMax.toFixed(2)}`,
      `Entry focus: ${previewList(model.entryFocus, 3)}`,
      `Exit focus: ${previewList(model.exitFocus, 3)}`
    ];

    if (strategy) {
      lines.push(
        `Strategy ${strategy.name}: market ${previewList(strategy.marketConditions)} | trigger ${previewList(strategy.entry.trigger)} | management ${previewList(strategy.exit.management)}`
      );
    }

    return lines.join("\n");
  }).join("\n\n");
};
