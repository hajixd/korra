import assert from "node:assert/strict";
import test from "node:test";
import { POST as panelAnalyticsPost } from "../app/api/backtest/panel-analytics/route";

const ALL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_SESSIONS = ["Tokyo", "Sydney", "London", "New York"];
const ALL_MONTHS = Array.from({ length: 12 }, (_, index) => index);
const ALL_HOURS = Array.from({ length: 24 }, (_, index) => index);

const baseFilterSettings = (overrides?: Record<string, unknown>) => ({
  statsDateStart: "2025-01-01",
  statsDateEnd: "2025-12-31",
  enabledBacktestWeekdays: ALL_WEEKDAYS,
  enabledBacktestSessions: ALL_SESSIONS,
  enabledBacktestMonths: ALL_MONTHS,
  enabledBacktestHours: ALL_HOURS,
  aiMode: "knn",
  antiCheatEnabled: false,
  validationMode: "off",
  selectedAiLibraries: ["base"],
  selectedAiLibrarySettings: {
    base: { weight: 100, maxSamples: 1000 },
    core: { weight: 100, maxSamples: 1000 }
  },
  distanceMetric: "euclidean",
  knnNeighborSpace: "high",
  ...(overrides ?? {})
});

const makeTrade = (params: {
  id: string;
  entryIso: string;
  exitIso: string;
  side?: "Long" | "Short";
  result?: "Win" | "Loss";
  pnlUsd?: number;
  pnlPct?: number;
  entryPrice?: number;
  targetPrice?: number;
  stopPrice?: number;
  outcomePrice?: number;
  neighborVector?: number[];
}) => {
  return {
    id: params.id,
    symbol: "XAUUSD",
    side: params.side ?? "Long",
    result: params.result ?? "Win",
    entrySource: "Momentum",
    pnlPct: params.pnlPct ?? 0.2,
    pnlUsd: params.pnlUsd ?? 100,
    entryTime: Math.floor(Date.parse(params.entryIso) / 1000),
    exitTime: Math.floor(Date.parse(params.exitIso) / 1000),
    entryPrice: params.entryPrice ?? 100,
    targetPrice: params.targetPrice ?? 101,
    stopPrice: params.stopPrice ?? 99,
    outcomePrice: params.outcomePrice ?? 101,
    units: 100,
    neighborVector: params.neighborVector
  };
};

const postPanelAnalytics = async (payload: Record<string, unknown>) => {
  const response = await panelAnalyticsPost(
    new Request("http://localhost/api/backtest/panel-analytics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );

  assert.equal(response.ok, true, `panel analytics request failed with ${response.status}`);
  return response.json();
};

test("non-core libraries do not fall back to live trades", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z"
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T02:00:00Z",
      exitIso: "2025-03-01T03:00:00Z",
      result: "Loss",
      pnlUsd: -100,
      pnlPct: -0.2,
      outcomePrice: 99
    })
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: [],
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"]
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a second stamped trade");
  assert.deepEqual(stampedTrade.entryNeighbors, []);
  assert.equal(stampedTrade.closestClusterUid, null);
});

test("core library uses live trades and keeps MIT aligned to neighbor #1", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z"
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T02:00:00Z",
      exitIso: "2025-03-01T03:00:00Z",
      result: "Loss",
      pnlUsd: -100,
      pnlPct: -0.2,
      outcomePrice: 99
    })
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: [],
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["core"]
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      core: { weight: 100, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a second stamped trade");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors) && stampedTrade.entryNeighbors.length > 0);
  const firstNeighborUid =
    stampedTrade.entryNeighbors[0]?.metaUid ?? stampedTrade.entryNeighbors[0]?.uid ?? null;
  assert.equal(stampedTrade.closestClusterUid, firstNeighborUid);
  assert.equal(String(firstNeighborUid).startsWith("lib|"), false);
});

test("canonical library points stamp MIT to nearest neighbor #1", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z"
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T02:00:00Z",
      exitIso: "2025-03-01T03:00:00Z",
      result: "Loss",
      pnlUsd: -100,
      pnlPct: -0.2,
      outcomePrice: 99
    })
  ];

  const libraryPoints = [
    {
      uid: "lib|base|alpha|0",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      metaPnl: 180,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [0.9, 0.1, 0.3, 0.4, 0.2, 0.5]
    },
    {
      uid: "lib|base|beta|1",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-27T00:00:00Z") / 1000),
      metaPnl: -160,
      metaOutcome: "Loss",
      metaSession: "London",
      dir: -1,
      label: -1,
      v: [-0.8, -0.2, -0.1, 0.6, 0.1, 0.25]
    }
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"]
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a second stamped trade");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors) && stampedTrade.entryNeighbors.length > 0);
  const firstNeighborUid =
    stampedTrade.entryNeighbors[0]?.metaUid ?? stampedTrade.entryNeighbors[0]?.uid ?? null;
  assert.equal(stampedTrade.closestClusterUid, firstNeighborUid);
  assert.equal(String(firstNeighborUid).startsWith("lib|base|"), true);
});

test("neighbor calculation space changes ranking", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z"
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T02:00:00Z",
      exitIso: "2025-03-01T03:00:00Z",
      neighborVector: [1, 1, 0, 0, 0, 0]
    })
  ];

  const libraryPoints = [
    {
      uid: "lib|base|post-winner|0",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      metaPnl: 180,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [100, 100, 0, 0, 0, 0]
    },
    {
      uid: "lib|base|high-winner|1",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-27T00:00:00Z") / 1000),
      metaPnl: 90,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [1, 1, 10, 10, 10, 10]
    }
  ];

  const highPayload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      knnNeighborSpace: "high"
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const postPayload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      knnNeighborSpace: "post"
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const highNeighbor =
    highPayload.timeFilteredTrades[1]?.entryNeighbors?.[0]?.metaUid ??
    highPayload.timeFilteredTrades[1]?.entryNeighbors?.[0]?.uid;
  const postNeighbor =
    postPayload.timeFilteredTrades[1]?.entryNeighbors?.[0]?.metaUid ??
    postPayload.timeFilteredTrades[1]?.entryNeighbors?.[0]?.uid;

  assert.equal(highNeighbor, "lib|base|high-winner|1");
  assert.equal(postNeighbor, "lib|base|post-winner|0");
  assert.notEqual(highNeighbor, postNeighbor);
});
