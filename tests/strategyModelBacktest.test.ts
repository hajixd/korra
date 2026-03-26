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

  assert.equal(blueprints.length, 6);

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
      ["alpha", "beta"],
      ["alpha", "beta"]
    ]
  );
});

test("same-entry-candle stopouts are preserved as blueprints", () => {
  const startMs = Date.parse("2025-01-01T00:00:00Z");
  const candles = [
    { time: startMs + 0 * 60_000, open: 100, high: 100.2, low: 99.8, close: 100.1 },
    { time: startMs + 1 * 60_000, open: 100.1, high: 100.3, low: 100.0, close: 100.2 },
    { time: startMs + 2 * 60_000, open: 100.2, high: 100.4, low: 100.1, close: 100.3 },
    { time: startMs + 3 * 60_000, open: 100.3, high: 100.7, low: 99.7, close: 100.4 },
    { time: startMs + 4 * 60_000, open: 100.4, high: 100.5, low: 100.2, close: 100.3 }
  ];
  const models: StrategyReplayModelProfile[] = [
    {
      id: "alpha",
      name: "Alpha",
      riskMin: 0.001,
      riskMax: 0.002,
      rrMin: 1,
      rrMax: 1,
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
    tpDollars: 0.4,
    slDollars: 0.4,
    strategyCatalog: buildAlwaysOnCatalog()
  });

  const sameBarStopout = blueprints.find(
    (blueprint) => blueprint.entryIndex === 3 && blueprint.exitIndex === 3
  );

  assert.ok(sameBarStopout);
});
