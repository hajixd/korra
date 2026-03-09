import {
  computeBacktestHistoryRowsChunk,
  finalizeBacktestHistoryRows,
  type BacktestHistoryCandle,
  type BacktestHistoryRow,
  type BacktestHistoryTradeBlueprint
} from "../app/backtestHistoryShared";
import { resolveStrategyRuntimeModelProfile } from "./strategyCatalog";
import {
  buildStrategyReplayTradeBlueprints,
  type StrategyReplayModelProfile
} from "./strategyModelBacktest";

export type CopyTradeTimeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

export type CopyTradeCandle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
  volume?: number;
};

type ModelProfile = StrategyReplayModelProfile;

export type CopyTradeSignalSettings = {
  symbol: string;
  dollarsPerMove: number;
  chunkBars: number;
  maxConcurrentTrades: number;
  tpDollars: number;
  slDollars: number;
  stopMode: number;
  breakEvenTriggerPct: number;
  trailingStartPct: number;
  trailingDistPct: number;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const hashSeedFromText = (seedText: string): number => {
  let seed = 0;

  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 33 + seedText.charCodeAt(i)) >>> 0;
  }

  return seed;
};

const createModelId = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "model";
};

const createSyntheticModelProfile = (name: string): ModelProfile => {
  const seed = hashSeedFromText(name);
  const sample = (shift: number) => ((seed >>> shift) & 255) / 255;
  const riskMin = 0.0011 + sample(0) * 0.001;
  const rrMin = 1.1 + sample(8) * 0.75;

  return {
    id: createModelId(name),
    name,
    riskMin,
    riskMax: riskMin + 0.0018 + sample(16) * 0.0022,
    rrMin,
    rrMax: rrMin + 0.75 + sample(24) * 1,
    longBias: 0.45 + sample(4) * 0.12
  };
};

const buildModelProfiles = (aiZipModelNames: string[]): ModelProfile[] => {
  const seen = new Set<string>();
  const profiles: ModelProfile[] = [];

  for (const rawName of aiZipModelNames) {
    const name = rawName.trim();

    if (!name) {
      continue;
    }

    const catalogProfile = resolveStrategyRuntimeModelProfile(name);
    const modelId = catalogProfile?.id ?? createModelId(name);

    if (seen.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    profiles.push(
      catalogProfile
        ? {
            id: catalogProfile.id,
            name: catalogProfile.name,
            riskMin: catalogProfile.riskMin,
            riskMax: catalogProfile.riskMax,
            rrMin: catalogProfile.rrMin,
            rrMax: catalogProfile.rrMax,
            longBias: catalogProfile.longBias
          }
        : createSyntheticModelProfile(name)
    );
  }

  return profiles;
};

const insertSortedExit = (activeExitMs: number[], exitMs: number) => {
  let insertAt = activeExitMs.length;
  while (insertAt > 0 && activeExitMs[insertAt - 1]! > exitMs) {
    insertAt -= 1;
  }
  activeExitMs.splice(insertAt, 0, exitMs);
};

const enforceMaxConcurrentTradeBlueprints = (
  blueprints: BacktestHistoryTradeBlueprint[],
  maxConcurrentTrades: number
): BacktestHistoryTradeBlueprint[] => {
  const limit = clamp(Math.floor(Number(maxConcurrentTrades) || 0), 0, 500);
  if (limit <= 0 || blueprints.length === 0) {
    return [];
  }

  const chronological = [...blueprints]
    .filter(
      (blueprint) =>
        Number.isFinite(blueprint.entryMs) &&
        Number.isFinite(blueprint.exitMs) &&
        blueprint.exitMs > blueprint.entryMs
    )
    .sort(
      (left, right) =>
        left.entryMs - right.entryMs ||
        left.exitMs - right.exitMs ||
        left.id.localeCompare(right.id)
    );

  const selected: BacktestHistoryTradeBlueprint[] = [];
  const activeExitMs: number[] = [];

  for (const blueprint of chronological) {
    while (activeExitMs.length > 0 && activeExitMs[0]! <= blueprint.entryMs) {
      activeExitMs.shift();
    }

    if (activeExitMs.length >= limit) {
      continue;
    }

    selected.push(blueprint);
    insertSortedExit(activeExitMs, blueprint.exitMs);
  }

  return selected.sort((left, right) => right.exitMs - left.exitMs);
};

const toBacktestCandles = (candles: CopyTradeCandle[]): BacktestHistoryCandle[] => {
  return candles.map((candle) => ({
    open: candle.open,
    close: candle.close,
    high: candle.high,
    low: candle.low,
    time: candle.time
  }));
};

export const computeActiveReplaySignal = (args: {
  candles: CopyTradeCandle[];
  aiZipModelNames: string[];
  settings: CopyTradeSignalSettings;
  nowMs?: number;
}): BacktestHistoryRow | null => {
  const { candles, aiZipModelNames, settings, nowMs } = args;

  if (candles.length < 48) {
    return null;
  }

  const modelProfiles = buildModelProfiles(aiZipModelNames);

  if (modelProfiles.length === 0) {
    return null;
  }

  const blueprints = buildStrategyReplayTradeBlueprints({
    candles,
    models: modelProfiles,
    symbol: settings.symbol,
    unitsPerMove: settings.dollarsPerMove,
    chunkBars: settings.chunkBars,
    tpDollars: settings.tpDollars,
    slDollars: settings.slDollars,
    stopMode: settings.stopMode,
    breakEvenTriggerPct: settings.breakEvenTriggerPct,
    trailingStartPct: settings.trailingStartPct,
    trailingDistPct: settings.trailingDistPct
  });

  const constrainedBlueprints = enforceMaxConcurrentTradeBlueprints(
    blueprints,
    settings.maxConcurrentTrades
  );

  if (constrainedBlueprints.length === 0) {
    return null;
  }

  const modelNamesById = modelProfiles.reduce<Record<string, string>>((accumulator, profile) => {
    accumulator[profile.id] = profile.name;
    return accumulator;
  }, {});

  const rows = finalizeBacktestHistoryRows(
    computeBacktestHistoryRowsChunk({
      blueprints: constrainedBlueprints,
      candleSeriesBySymbol: {
        [settings.symbol]: toBacktestCandles(candles)
      },
      minutePreciseEnabled: false,
      modelNamesById,
      tpDollars: settings.tpDollars,
      slDollars: settings.slDollars,
      stopMode: settings.stopMode,
      breakEvenTriggerPct: settings.breakEvenTriggerPct,
      trailingStartPct: settings.trailingStartPct,
      trailingDistPct: settings.trailingDistPct
    }),
    constrainedBlueprints.length
  );

  if (rows.length === 0) {
    return null;
  }

  const latestCandleTimeMs = candles[candles.length - 1]?.time ?? Date.now();
  const activeThresholdSec = Math.floor((nowMs ?? latestCandleTimeMs) / 1000);

  const activeRows = rows
    .filter((row) => row.entryTime <= activeThresholdSec && row.exitTime > activeThresholdSec)
    .sort(
      (left, right) =>
        right.entryTime - left.entryTime ||
        right.exitTime - left.exitTime ||
        left.id.localeCompare(right.id)
    );

  return activeRows[0] ?? null;
};
