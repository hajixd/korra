import assert from "node:assert/strict";
import test from "node:test";
import { computeBacktestHistoryRowsChunk } from "../app/backtestHistoryShared";

test("same-bar ambiguous exits use the entry open and resolve conservatively to a loss", () => {
  const startMs = Date.parse("2025-01-01T00:00:00Z");
  const candles = Array.from({ length: 20 }, (_, index) => {
    const time = startMs + index * 15 * 60_000;
    if (index === 5) {
      return {
        time,
        open: 100,
        high: 110,
        low: 95,
        close: 108
      };
    }

    return {
      time,
      open: 100 + index * 0.1,
      high: 100.2 + index * 0.1,
      low: 99.8 + index * 0.1,
      close: 100.1 + index * 0.1
    };
  });

  const rows = computeBacktestHistoryRowsChunk({
    blueprints: [
      {
        id: "trade-1",
        modelId: "alpha",
        symbol: "XAUUSD",
        side: "Long",
        result: "Win",
        entryMs: candles[5]!.time,
        exitMs: candles[5]!.time,
        entryIndex: 5,
        exitIndex: 5,
        riskPct: 0.01,
        rr: 1,
        units: 1
      }
    ],
    candleSeriesBySymbol: {
      XAUUSD: candles
    },
    minutePreciseEnabled: false,
    modelNamesById: {
      alpha: "Alpha"
    },
    tpDollars: 5,
    slDollars: 5,
    stopMode: 0,
    breakEvenTriggerPct: 50,
    trailingStartPct: 50,
    trailingDistPct: 30
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.entryPrice, 100);
  assert.equal(rows[0]?.result, "Loss");
  assert.equal(rows[0]?.outcomePrice, 95);
  assert.equal(rows[0]?.pnlUsd, -5);
});
