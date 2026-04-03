import assert from "node:assert/strict";
import test from "node:test";
import {
  getBacktestEntryExitStatsExitBucket,
  getBacktestExitLabel,
  normalizeBacktestExitReason
} from "../lib/backtestExitReason";

const baseTrade = {
  entryPrice: 100,
  targetPrice: 104,
  stopPrice: 98,
  outcomePrice: 101
};

test("normalizes canonical backtest exit reasons", () => {
  assert.equal(normalizeBacktestExitReason("tp"), "Take Profit");
  assert.equal(normalizeBacktestExitReason("sl"), "Stop Loss");
  assert.equal(normalizeBacktestExitReason("model exit"), "Model Exit");
});

test("labels implicit model exits consistently", () => {
  assert.equal(
    getBacktestExitLabel({
      ...baseTrade,
      result: "Win",
      exitReason: ""
    }),
    "Model Exit"
  );
});

test("splits model exits into win and loss buckets for entry and exit stats", () => {
  assert.equal(
    getBacktestEntryExitStatsExitBucket({
      ...baseTrade,
      result: "Win",
      exitReason: "Model Exit"
    }),
    "Model Exit Win"
  );

  assert.equal(
    getBacktestEntryExitStatsExitBucket({
      ...baseTrade,
      result: "Loss",
      exitReason: "Model Exit"
    }),
    "Model Exit Loss"
  );
});

test("keeps non-model exit buckets unchanged", () => {
  assert.equal(
    getBacktestEntryExitStatsExitBucket({
      ...baseTrade,
      result: "Win",
      exitReason: "TP",
      outcomePrice: 104
    }),
    "Take Profit"
  );
});
