import assert from "node:assert/strict";
import test from "node:test";
import {
  AIZIP_BACKTEST_HISTORY_FETCH_TIMEOUT_MS,
  buildSeededLibraryTradePoolFromCandles,
  canRunAizipLibraries,
  canRunAizipLibrariesForSettings,
  countEnabledAizipModels,
  doesAizipHistorySeedSettingsChange,
  getVisibleAizipLibraryIds,
  shouldSkipAizipBacktestHistoryFetch,
  usesAizipEveryCandleMode
} from "../app/aizipRuntime";

test("base seeding libraries can run without selected models", () => {
  assert.equal(
    canRunAizipLibraries({
      libraryIds: ["base"],
      selectedModelCount: 0
    }),
    true
  );
  assert.equal(
    canRunAizipLibraries({
      libraryIds: ["recent"],
      selectedModelCount: 0
    }),
    false
  );
});

test("library readiness is derived from the applied model snapshot", () => {
  assert.equal(
    canRunAizipLibrariesForSettings({
      libraryIds: ["recent"],
      aiModelStates: {
        Momentum: 0,
        Reversal: 2
      }
    }),
    true
  );
  assert.equal(
    canRunAizipLibrariesForSettings({
      libraryIds: ["recent"],
      aiModelStates: {
        Momentum: 0,
        Reversal: 0
      }
    }),
    false
  );
  assert.equal(
    canRunAizipLibrariesForSettings({
      libraryIds: ["base"],
      aiModelStates: {
        Momentum: 0
      }
    }),
    true
  );
});

test("visible libraries exclude online and ghost learning toggles", () => {
  assert.deepEqual(
    getVisibleAizipLibraryIds(["core", "suppressed", "base", "recent"]),
    ["base", "recent"]
  );
  assert.equal(
    countEnabledAizipModels({
      Momentum: 0,
      Reversal: 2,
      Breakout: null
    }),
    1
  );
});

test("backtest history is not skipped when base libraries need candle history", () => {
  assert.equal(
    shouldSkipAizipBacktestHistoryFetch({
      antiCheatEnabled: false,
      selectedModelCount: 0,
      selectedAiLibraries: ["base"]
    }),
    false
  );
  assert.equal(
    shouldSkipAizipBacktestHistoryFetch({
      antiCheatEnabled: false,
      selectedModelCount: 0,
      selectedAiLibraries: []
    }),
    true
  );
});

test("every-candle mode only applies when AI mode is on and filter-only mode is off", () => {
  assert.equal(usesAizipEveryCandleMode("knn", false), true);
  assert.equal(usesAizipEveryCandleMode("knn", true), false);
  assert.equal(usesAizipEveryCandleMode("off", false), false);
});

test("seeded library trades are stamped in seconds, not milliseconds", () => {
  const candles = Array.from({ length: 18 }, (_, index) => {
    const base = 100 + index * 0.2;
    return {
      time: Date.parse(`2025-03-01T${String(index).padStart(2, "0")}:00:00Z`),
      open: base,
      high: base + 0.4,
      low: base - 0.2,
      close: base + 0.25
    };
  });

  const trades = buildSeededLibraryTradePoolFromCandles({
    candles,
    symbol: "XAUUSD",
    unitsPerMove: 25,
    tpDollars: 100,
    slDollars: 100,
    chunkBars: 2,
    maxLookaheadBars: 4,
    formatTimestamp: (timestampSeconds) => String(timestampSeconds)
  });

  assert.ok(trades.length > 0, "expected seeded library trades");
  const firstTrade = trades[0]!;
  assert.ok(firstTrade.entryTime < 10_000_000_000, "entry time should be seconds");
  assert.ok(firstTrade.exitTime < 10_000_000_000, "exit time should be seconds");
  assert.ok(firstTrade.exitTime >= firstTrade.entryTime, "exit should not precede entry");
});

test("history seed reloads when date range or seed coverage inputs change", () => {
  const base = {
    symbol: "XAUUSD",
    timeframe: "15m",
    minutePreciseEnabled: false,
    statsDateStart: "2025-03-01",
    statsDateEnd: "2026-03-01",
    chunkBars: 24,
    maxBarsInTrade: 0
  } as const;

  assert.equal(doesAizipHistorySeedSettingsChange(base, base), false);
  assert.equal(
    doesAizipHistorySeedSettingsChange(base, {
      ...base,
      statsDateStart: "2025-02-01"
    }),
    true
  );
  assert.equal(
    doesAizipHistorySeedSettingsChange(base, {
      ...base,
      chunkBars: 48
    }),
    true
  );
});

test("backtest history timeout stays long enough for deep seed loads", () => {
  assert.equal(AIZIP_BACKTEST_HISTORY_FETCH_TIMEOUT_MS >= 5000, true);
});
