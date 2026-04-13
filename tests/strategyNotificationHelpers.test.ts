import assert from "node:assert/strict";
import test from "node:test";
import type { BacktestHistoryRow } from "../app/backtestHistoryShared";
import {
  selectActiveStrategyNotificationSignal,
  type StrategyNotificationSettings
} from "../lib/strategyNotificationEngine";
import {
  DEFAULT_STRATEGY_NOTIFICATION_SETTINGS,
  buildTradeNotificationBody
} from "../lib/strategyNotificationHelpers";

const TEST_SETTINGS: StrategyNotificationSettings = {
  ...DEFAULT_STRATEGY_NOTIFICATION_SETTINGS,
  symbol: "XAUUSD",
  timeframe: "15m",
  precisionTimeframe: "15m"
};

const buildRow = (overrides: Partial<BacktestHistoryRow>): BacktestHistoryRow => ({
  id: "row",
  symbol: "XAUUSD",
  side: "Long",
  result: "Win",
  entrySource: "Settings",
  exitReason: "Take Profit",
  pnlPct: 1,
  pnlUsd: 100,
  time: "Jan 1, 2025, 12:00 AM",
  entryAt: "Jan 1, 2025, 12:00 AM",
  exitAt: "Jan 1, 2025, 12:15 AM",
  entryTime: 0,
  exitTime: 0,
  entryPrice: 2300,
  targetPrice: 2340,
  stopPrice: 2280,
  outcomePrice: 2340,
  units: 25,
  ...overrides
});

test("strategy notifications choose the trade active on the latest candle", () => {
  const signal = selectActiveStrategyNotificationSignal({
    rows: [
      buildRow({ id: "closed-before-latest", entryTime: 120, exitTime: 290 }),
      buildRow({ id: "active-on-latest", entryTime: 240, exitTime: 360 }),
      buildRow({ id: "future-trade", entryTime: 320, exitTime: 420 })
    ],
    candles: [
      { time: 240_000, open: 2300, high: 2310, low: 2290, close: 2305 },
      { time: 300_000, open: 2305, high: 2315, low: 2300, close: 2310 }
    ],
    settings: TEST_SETTINGS
  });

  assert.equal(signal?.id, "active-on-latest");
});

test("strategy notifications can still surface a trade active within the previous two candles", () => {
  const signal = selectActiveStrategyNotificationSignal({
    rows: [
      buildRow({ id: "older-trade", entryTime: 60, exitTime: 120 }),
      buildRow({ id: "active-on-previous-candle", entryTime: 180, exitTime: 260 }),
      buildRow({ id: "future-trade", entryTime: 320, exitTime: 420 })
    ],
    candles: [
      { time: 180_000, open: 2300, high: 2310, low: 2290, close: 2305 },
      { time: 240_000, open: 2305, high: 2315, low: 2300, close: 2310 },
      { time: 300_000, open: 2310, high: 2318, low: 2306, close: 2312 }
    ],
    settings: TEST_SETTINGS
  });

  assert.equal(signal?.id, "active-on-previous-candle");
});

test("trade notification body includes the requested trade fields", () => {
  const body = buildTradeNotificationBody({
    symbol: "XAUUSD",
    side: "Buy",
    label: "entry",
    entryPrice: 2310.125,
    takeProfit: 2350.125,
    stopLoss: 2290.125,
    triggerTimeMs: Date.parse("2026-04-12T15:30:00Z")
  });

  assert.match(body, /Entry Price: 2310\.13/);
  assert.match(body, /Take Profit: 2350\.13/);
  assert.match(body, /Stop Loss: 2290\.13/);
  assert.match(body, /Trigger Time:/);
});
