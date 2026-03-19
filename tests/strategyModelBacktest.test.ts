import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStrategyReplayTradeBlueprints,
  type StrategyReplayModelProfile
} from "../lib/strategyModelBacktest";
import type { StrategyModelCatalogEntry } from "../lib/strategyCatalog";

const buildStableCandles = () => {
  const startMs = Date.parse("2025-01-01T00:00:00Z");

  return Array.from({ length: 6 }, (_, index) => {
    const open = 100 + index * 0.01;
    return {
      time: startMs + index * 60_000,
      open,
      high: open + 0.01,
      low: open - 0.01,
      close: open + 0.005
    };
  });
};

const buildAlwaysOnCatalog = (): readonly StrategyModelCatalogEntry[] => {
  const makeEntry = (id: string, name: string): StrategyModelCatalogEntry => ({
    id,
    name,
    aliases: [],
    description: "Test model",
    entry: {
      context: [],
      setup: [],
      trigger: [],
      confirmation: [],
      invalidation: [],
      noTrade: []
    },
    exit: {
      stopLoss: [],
      takeProfit: [],
      timeExit: [],
      earlyExit: []
    },
    backtest: {
      entry: {
        long: {
          checks: [
            {
              label: "Always long",
              when: {
                not: {
                  feature: "__never__"
                }
              }
            }
          ]
        },
        short: {
          checks: [
            {
              label: "Never short",
              when: {
                feature: "__never__"
              }
            }
          ]
        }
      }
    }
  });

  return [makeEntry("alpha", "Alpha"), makeEntry("beta", "Beta")];
};

test("replay emits one blueprint per matching model on the same signal candle", () => {
  const candles = buildStableCandles();
  const models: StrategyReplayModelProfile[] = [
    {
      id: "alpha",
      name: "Alpha",
      riskMin: 0.001,
      riskMax: 0.002,
      rrMin: 1,
      rrMax: 2,
      longBias: 0.5,
      state: 2
    },
    {
      id: "beta",
      name: "Beta",
      riskMin: 0.001,
      riskMax: 0.002,
      rrMin: 1,
      rrMax: 2,
      longBias: 0.5,
      state: 2
    }
  ];

  const blueprints = buildStrategyReplayTradeBlueprints({
    candles,
    models,
    symbol: "XAUUSD",
    unitsPerMove: 1,
    chunkBars: 2,
    maxBarsInTrade: 1,
    strategyCatalog: buildAlwaysOnCatalog()
  });

  assert.equal(blueprints.length, 4);

  const modelsByEntryMs = new Map<number, string[]>();
  for (const blueprint of blueprints) {
    const existing = modelsByEntryMs.get(blueprint.entryMs) ?? [];
    existing.push(blueprint.modelId);
    modelsByEntryMs.set(blueprint.entryMs, existing);
  }

  assert.deepEqual(
    Array.from(modelsByEntryMs.values()).map((modelIds) => modelIds.sort()),
    [
      ["alpha", "beta"],
      ["alpha", "beta"]
    ]
  );
});
