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
  selectedAiDomains: [],
  kEntry: 12,
  knnVoteMode: "majority",
  ...(overrides ?? {})
});

const assertApprox = (actual: number, expected: number, epsilon = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
};

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

test("core library excludes the selected live trade from its own neighbor list", async () => {
  const trades = Array.from({ length: 6 }, (_, index) =>
    makeTrade({
      id: `live-${index + 1}`,
      entryIso: new Date(Date.parse("2025-03-01T00:00:00Z") + index * 2 * 60 * 60 * 1000).toISOString(),
      exitIso: new Date(Date.parse("2025-03-01T01:00:00Z") + index * 2 * 60 * 60 * 1000).toISOString(),
      result: index % 2 === 0 ? "Win" : "Loss",
      pnlUsd: index % 2 === 0 ? 100 + index : -(100 + index),
      pnlPct: index % 2 === 0 ? 0.2 : -0.2,
      outcomePrice: index % 2 === 0 ? 101 : 99,
      neighborVector: [index / 10, index / 10, 0, 0, 0, 0]
    })
  );

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

  const stampedTrade = payload.timeFilteredTrades[3];
  assert.ok(stampedTrade, "expected a stamped trade");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors) && stampedTrade.entryNeighbors.length > 0);
  const firstNeighborUid =
    stampedTrade.entryNeighbors[0]?.metaUid ?? stampedTrade.entryNeighbors[0]?.uid ?? null;
  assert.notEqual(firstNeighborUid, String(stampedTrade.id));
  assert.equal(stampedTrade.closestClusterUid, firstNeighborUid);
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

test("stored neighbor order stays nearest-first even when library weights differ", async () => {
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
      neighborVector: [0, 0, 0, 0, 0, 0]
    })
  ];

  const libraryPoints = [
    {
      uid: "lib|alpha|nearest|0",
      libId: "alpha",
      metaTime: Math.floor(Date.parse("2025-02-28T02:00:00Z") / 1000),
      metaPnl: 120,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [0, 0, 0, 0, 0, 0.01]
    },
    {
      uid: "lib|beta|weighted|0",
      libId: "beta",
      metaTime: Math.floor(Date.parse("2025-02-28T02:00:00Z") / 1000),
      metaPnl: 120,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [1, 1, 1, 1, 1, 1]
    }
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["alpha", "beta"],
      selectedAiLibrarySettings: {
        alpha: { weight: 25, maxSamples: 1000 },
        beta: { weight: 500, maxSamples: 1000 }
      }
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      alpha: { weight: 25, maxSamples: 1000 },
      beta: { weight: 500, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a second stamped trade");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors) && stampedTrade.entryNeighbors.length >= 2);

  const firstNeighborUid =
    stampedTrade.entryNeighbors[0]?.metaUid ?? stampedTrade.entryNeighbors[0]?.uid ?? null;
  const secondNeighborUid =
    stampedTrade.entryNeighbors[1]?.metaUid ?? stampedTrade.entryNeighbors[1]?.uid ?? null;

  assert.equal(firstNeighborUid, "lib|alpha|nearest|0");
  assert.equal(secondNeighborUid, "lib|beta|weighted|0");
  assert.equal(stampedTrade.closestClusterUid, firstNeighborUid);
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

test("panel analytics confidence honors kEntry instead of scoring every candidate", async () => {
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
      neighborVector: [0, 0, 0, 0, 0, 0]
    })
  ];

  const libraryPoints = [
    {
      uid: "lib|base|nearest-win|0",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      metaPnl: 120,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [0, 0, 0, 0, 0, 0.01]
    },
    {
      uid: "lib|base|far-loss|1",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-27T00:00:00Z") / 1000),
      metaPnl: -120,
      metaOutcome: "Loss",
      metaSession: "London",
      dir: 1,
      label: -1,
      v: [1, 1, 1, 1, 1, 1]
    },
    {
      uid: "lib|base|farther-loss|2",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-26T00:00:00Z") / 1000),
      metaPnl: -140,
      metaOutcome: "Loss",
      metaSession: "London",
      dir: 1,
      label: -1,
      v: [1.2, 1.2, 1.2, 1.2, 1.2, 1.2]
    }
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      kEntry: 1,
      knnVoteMode: "majority"
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a second stamped trade");
  assert.equal(stampedTrade.entryNeighbors.length, 1);
  assert.equal(stampedTrade.closestClusterUid, "lib|base|nearest-win|0");
  assertApprox(Number(stampedTrade.entryConfidence), 1);
});

test("panel analytics coerces legacy distance vote mode to majority confidence", async () => {
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
      neighborVector: [0, 0, 0, 0, 0, 0]
    })
  ];

  const libraryPoints = [
    {
      uid: "lib|base|near-win|0",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      metaPnl: 110,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [0, 0, 0, 0, 0, 0.01]
    },
    {
      uid: "lib|base|far-loss|1",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-27T00:00:00Z") / 1000),
      metaPnl: -110,
      metaOutcome: "Loss",
      metaSession: "London",
      dir: 1,
      label: -1,
      v: [2, 2, 2, 2, 2, 2]
    }
  ];

  const majorityPayload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      kEntry: 2,
      knnVoteMode: "majority"
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const legacyDistancePayload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      kEntry: 2,
      knnVoteMode: "distance"
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const majorityConfidence = Number(majorityPayload.timeFilteredTrades[1]?.entryConfidence);
  const legacyDistanceConfidence = Number(
    legacyDistancePayload.timeFilteredTrades[1]?.entryConfidence
  );

  assertApprox(majorityConfidence, 0.5);
  assertApprox(legacyDistanceConfidence, majorityConfidence);
});

test("panel analytics honors selected AI domains when filtering neighbors", async () => {
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
      side: "Long",
      neighborVector: [0, 0, 0, 0, 0, 0]
    })
  ];

  const libraryPoints = [
    {
      uid: "lib|base|opposite-close|0",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      metaPnl: -100,
      metaOutcome: "Loss",
      metaSession: "London",
      dir: -1,
      label: -1,
      v: [0, 0, 0, 0, 0, 0.01]
    },
    {
      uid: "lib|base|same-side-far|1",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-27T00:00:00Z") / 1000),
      metaPnl: 120,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [1, 1, 1, 1, 1, 1]
    }
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      selectedAiDomains: ["Direction"],
      kEntry: 1,
      knnVoteMode: "majority"
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a second stamped trade");
  assert.equal(stampedTrade.closestClusterUid, "lib|base|same-side-far|1");
  assert.equal(stampedTrade.entryNeighbors[0]?.dir, 1);
  assertApprox(Number(stampedTrade.entryConfidence), 1);
});

test("panel analytics caps stored neighbors to kEntry for large base libraries", async () => {
  const trades = Array.from({ length: 48 }, (_, index) =>
    makeTrade({
      id: `live-${index}`,
      entryIso: new Date(Date.parse("2025-03-01T00:00:00Z") + index * 3_600_000).toISOString(),
      exitIso: new Date(Date.parse("2025-03-01T01:00:00Z") + index * 3_600_000).toISOString(),
      side: index % 2 === 0 ? "Long" : "Short",
      result: index % 3 === 0 ? "Loss" : "Win",
      pnlUsd: index % 3 === 0 ? -120 : 140,
      pnlPct: index % 3 === 0 ? -0.2 : 0.25,
      outcomePrice: index % 3 === 0 ? 99 : 101,
      neighborVector: [
        Math.sin(index / 7),
        Math.cos(index / 9),
        (index % 5) / 5,
        (index % 7) / 7,
        (index % 11) / 11,
        (index % 13) / 13
      ]
    })
  );

  const libraryPoints = Array.from({ length: 1500 }, (_, index) => ({
    uid: `lib|base|bulk-${index}|${index}`,
    libId: "base",
    metaTime: Math.floor(Date.parse("2025-02-01T00:00:00Z") / 1000) + index * 300,
    metaPnl: index % 2 === 0 ? 110 : -105,
    metaOutcome: index % 2 === 0 ? "Win" : "Loss",
    metaSession: ALL_SESSIONS[index % ALL_SESSIONS.length],
    dir: index % 2 === 0 ? 1 : -1,
    label: index % 2 === 0 ? 1 : -1,
    v: [
      Math.sin(index / 7),
      Math.cos(index / 9),
      (index % 5) / 5,
      (index % 7) / 7,
      (index % 11) / 11,
      (index % 13) / 13
    ]
  }));

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      kEntry: 12
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 10000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[payload.timeFilteredTrades.length - 1];
  assert.ok(stampedTrade, "expected a stamped trade from the large base library run");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors), "expected stamped neighbors");
  assert.equal(stampedTrade.entryNeighbors.length, 12);
  const firstNeighborUid =
    stampedTrade.entryNeighbors[0]?.metaUid ?? stampedTrade.entryNeighbors[0]?.uid ?? null;
  assert.equal(stampedTrade.closestClusterUid, firstNeighborUid);
});

test("synthetic validation uses the full trade history as its training pool", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z",
      result: "Loss",
      pnlUsd: -100,
      pnlPct: -0.2,
      outcomePrice: 99,
      neighborVector: [0, 0, 0, 0, 0, 0]
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T02:00:00Z",
      exitIso: "2025-03-01T03:00:00Z",
      neighborVector: [10, 10, 10, 10, 10, 10]
    }),
    makeTrade({
      id: "live-3",
      entryIso: "2025-03-01T04:00:00Z",
      exitIso: "2025-03-01T05:00:00Z",
      neighborVector: [10.1, 10.1, 10.1, 10.1, 10.1, 10.1]
    })
  ];

  const onlinePayload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: [],
    panelBacktestFilterSettings: baseFilterSettings({
      antiCheatEnabled: true,
      validationMode: "off",
      selectedAiLibraries: ["core"]
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      core: { weight: 100, maxSamples: 1000 }
    }
  });

  const syntheticPayload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: [],
    panelBacktestFilterSettings: baseFilterSettings({
      antiCheatEnabled: true,
      validationMode: "synthetic",
      selectedAiLibraries: ["core"]
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      core: { weight: 100, maxSamples: 1000 }
    }
  });

  const onlineNeighborUid =
    onlinePayload.timeFilteredTrades[1]?.entryNeighbors?.[0]?.metaUid ??
    onlinePayload.timeFilteredTrades[1]?.entryNeighbors?.[0]?.uid;
  const syntheticNeighborUid =
    syntheticPayload.timeFilteredTrades[1]?.entryNeighbors?.[0]?.metaUid ??
    syntheticPayload.timeFilteredTrades[1]?.entryNeighbors?.[0]?.uid;

  assert.equal(onlineNeighborUid, "live-1");
  assert.equal(syntheticNeighborUid, "live-3");
});
