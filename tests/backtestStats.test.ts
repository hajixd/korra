import assert from "node:assert/strict";
import test from "node:test";
import {
  computeEntryExitChartData,
  computeEntryExitStats,
  computePerformanceStatsTemporalCharts
} from "../lib/backtestStats";

const countSeriesRows = (rows: Array<{ count: number }>) => {
  return rows.reduce((total, row) => total + row.count, 0);
};

test("performance stats include trades with blank entrySource under All and Unknown", () => {
  const stats = computePerformanceStatsTemporalCharts(
    [
      {
        entrySource: "",
        pnlUsd: 125,
        entryTime: Date.parse("2025-01-06T00:15:00Z") / 1000,
        exitTime: Date.parse("2025-01-06T00:45:00Z") / 1000
      },
      {
        entrySource: "Momentum",
        pnlUsd: -45,
        entryTime: Date.parse("2025-01-07T13:00:00Z") / 1000,
        exitTime: Date.parse("2025-01-07T13:20:00Z") / 1000
      }
    ],
    "All",
    true
  );

  assert.deepEqual(stats.modelOptions, ["All", "Unknown", "Momentum"]);
  assert.equal(stats.charts.hasData, true);
  assert.equal(countSeriesRows(stats.charts.hours), 2);

  const unknownOnly = computePerformanceStatsTemporalCharts(
    [
      {
        entrySource: "",
        pnlUsd: 125,
        entryTime: Date.parse("2025-01-06T00:15:00Z") / 1000,
        exitTime: Date.parse("2025-01-06T00:45:00Z") / 1000
      },
      {
        entrySource: "Momentum",
        pnlUsd: -45,
        entryTime: Date.parse("2025-01-07T13:00:00Z") / 1000,
        exitTime: Date.parse("2025-01-07T13:20:00Z") / 1000
      }
    ],
    "Unknown",
    true
  );

  assert.equal(countSeriesRows(unknownOnly.charts.hours), 1);
  assert.equal(unknownOnly.charts.hours.find((row) => row.bucket === "00:00")?.count, 1);
});

test("entry exit stats normalize empty labels into derived model and exit buckets", () => {
  const stats = computeEntryExitStats(
    [
      {
        result: "Win",
        entrySource: "Momentum",
        exitReason: "",
        entryPrice: 100,
        targetPrice: 101,
        stopPrice: 99.5,
        outcomePrice: 101
      },
      {
        result: "Loss",
        entrySource: "",
        exitReason: "",
        entryPrice: 100,
        targetPrice: 101.2,
        stopPrice: 99.6,
        outcomePrice: 99.6
      },
      {
        result: "Win",
        entrySource: "Momentum",
        exitReason: "model exit",
        entryPrice: 100,
        targetPrice: 102,
        stopPrice: 99,
        outcomePrice: 100.4
      }
    ],
    true
  );

  assert.deepEqual(stats.entry, [
    ["Momentum", 2],
    ["Unknown", 1]
  ]);
  assert.deepEqual(stats.exit, [
    ["Model Exit", 1],
    ["Stop Loss", 1],
    ["Take Profit", 1]
  ]);

  const chartData = computeEntryExitChartData(stats);

  assert.ok(
    Math.abs((chartData.entry.find((row) => row.bucket === "Momentum")?.share ?? 0) - 66.66666666666666) <
      0.000001
  );
  assert.equal(chartData.exit.find((row) => row.bucket === "Take Profit")?.count, 1);
});
