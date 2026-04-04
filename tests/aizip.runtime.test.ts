import assert from "node:assert/strict";
import test from "node:test";
import {
  AIZIP_BACKTEST_HISTORY_FETCH_TIMEOUT_MS,
  SYNTHETIC_LIBRARY_START_MS,
  buildSyntheticLibraryCandles,
  buildSeededLibraryTradePoolFromCandles,
  canRunAizipLibraries,
  canRunAizipLibrariesForSettings,
  countEnabledAizipModels,
  doesAizipReplayEntryModeChange,
  doesAizipHistorySeedSettingsChange,
  getAizipLibraryIdAliases,
  getSyntheticLibraryBarCount,
  getVisibleAizipLibraryIds,
  normalizeAizipLibraryId,
  partitionAizipLibraryTradePool,
  shouldSkipAizipBacktestHistoryFetch,
  usesAizipEveryCandleMode
} from "../app/aizipRuntime";

test("selected libraries can run without selected models", () => {
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

test("library readiness follows the selected library set", () => {
  assert.equal(
    canRunAizipLibrariesForSettings({
      libraryIds: ["recent"],
      aiModelStates: {
        Momentum: 0,
        Reversal: 2
      }
    }),
    false
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
    getVisibleAizipLibraryIds(["online", "ghost", "base", "recent"]),
    ["base"]
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

test("legacy library aliases normalize to online and ghost", () => {
  assert.equal(normalizeAizipLibraryId("core"), "online");
  assert.equal(normalizeAizipLibraryId("suppressed"), "ghost");
  assert.deepEqual(getAizipLibraryIdAliases("online"), ["online", "core"]);
  assert.deepEqual(getAizipLibraryIdAliases("ghost"), ["ghost", "suppressed"]);
  assert.deepEqual(getVisibleAizipLibraryIds(["core", "suppressed", "base"]), ["base"]);
});

test("online and ghost library pools partition accepted and rejected trades cleanly", () => {
  const pool = [
    { id: "t-1", tag: "first" },
    { id: "t-2", tag: "second" },
    { id: "t-3", tag: "third" },
    { id: "t-4", tag: "fourth" }
  ];
  const executedTradeIds = new Set(["t-2", "t-4"]);

  const { accepted, rejected } = partitionAizipLibraryTradePool(pool, executedTradeIds);

  assert.deepEqual(
    accepted.map((trade) => trade.id),
    ["t-2", "t-4"]
  );
  assert.deepEqual(
    rejected.map((trade) => trade.id),
    ["t-1", "t-3"]
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

test("every-candle mode stays off because AI Model now uses a hidden standard model", () => {
  assert.equal(usesAizipEveryCandleMode("knn", false), false);
  assert.equal(usesAizipEveryCandleMode("knn", true), false);
  assert.equal(usesAizipEveryCandleMode("off", false), false);
});

test("replay entry mode no longer changes when switching AI Filter and AI Model", () => {
  assert.equal(doesAizipReplayEntryModeChange("off", false, "knn", true), false);
  assert.equal(doesAizipReplayEntryModeChange("knn", true, "hdbscan", true), false);
  assert.equal(doesAizipReplayEntryModeChange("knn", true, "knn", false), false);
  assert.equal(doesAizipReplayEntryModeChange("knn", false, "off", false), false);
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
    precisionTimeframe: "15m",
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

test("synthetic library candles are deterministic and start in 1999", () => {
  const candleCount = getSyntheticLibraryBarCount(24);
  const left = buildSyntheticLibraryCandles({
    seedText: "synthetic-library|base|XAUUSD|15m",
    candleCount
  });
  const right = buildSyntheticLibraryCandles({
    seedText: "synthetic-library|base|XAUUSD|15m",
    candleCount
  });
  const other = buildSyntheticLibraryCandles({
    seedText: "synthetic-library|base|BTCUSD|15m",
    candleCount
  });

  assert.deepEqual(left, right);
  assert.ok(left.length >= 2048, "expected a full synthetic seed window");
  assert.equal(left[0]?.time, SYNTHETIC_LIBRARY_START_MS);
  assert.equal(new Date(SYNTHETIC_LIBRARY_START_MS).getUTCFullYear(), 1999);
  assert.notDeepEqual(left.slice(0, 8), other.slice(0, 8));
});

test("backtest history timeout stays long enough for deep seed loads", () => {
  assert.equal(AIZIP_BACKTEST_HISTORY_FETCH_TIMEOUT_MS >= 5000, true);
});
