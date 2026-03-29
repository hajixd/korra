import assert from "node:assert/strict";
import test from "node:test";
import { POST as aizipComputePost } from "../app/api/aizip/compute/route";
import { POST as panelAnalyticsPost } from "../app/api/backtest/panel-analytics/route";
import { isTradeCheatedByFutureDependency } from "../lib/aiTradeCheating";

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
  entrySource?: string;
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
    entrySource: params.entrySource ?? "Momentum",
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

const buildComputeCandles = (count = 320) => {
  const candleStartMs = Date.parse("2025-03-01T00:00:00Z");
  return Array.from({ length: count }, (_, index) => {
    const drift = index * 0.18;
    const base = 100 + drift + Math.sin(index / 9) * 0.7;
    return {
      time: candleStartMs + index * 15 * 60 * 1000,
      open: base,
      high: base + 0.6,
      low: base - 0.4,
      close: base + 0.2
    };
  });
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

const postAizipCompute = async (payload: Record<string, unknown>) => {
  const response = await aizipComputePost(
    new Request("http://localhost/api/aizip/compute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );

  assert.equal(response.ok, true, `aizip compute request failed with ${response.status}`);
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

test("suppressed library points stay selectable as ghost-learning neighbors", async () => {
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

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: [
      {
        uid: "lib|suppressed|loss|0",
        libId: "suppressed",
        metaTime: Math.floor(Date.parse("2025-02-27T00:00:00Z") / 1000),
        metaPnl: -160,
        metaOutcome: "Loss",
        metaSession: "London",
        dir: 1,
        label: -1,
        v: [0, 0, 0, 0, 0, 0]
      }
    ],
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["suppressed"],
      selectedAiLibrarySettings: {
        suppressed: { weight: 100, maxSamples: 1000 }
      }
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      suppressed: { weight: 100, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a second stamped trade");
  assert.equal(stampedTrade.closestClusterUid, "lib|suppressed|loss|0");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors) && stampedTrade.entryNeighbors.length > 0);
  assert.equal(stampedTrade.entryNeighbors[0]?.metaUid, "lib|suppressed|loss|0");
  assert.equal(stampedTrade.entryNeighbors[0]?.metaLib, "suppressed");
  assert.equal(stampedTrade.entryNeighbors[0]?.metaSuppressed, true);
});

test("panel analytics accepts compact transport payloads and still stamps neighbors", async () => {
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

  const packedTrades = trades.map((trade) => [
    trade.id,
    trade.symbol,
    trade.side,
    trade.result,
    trade.entrySource,
    "",
    trade.pnlPct,
    trade.pnlUsd,
    trade.entryTime,
    trade.exitTime,
    trade.entryPrice,
    trade.targetPrice,
    trade.stopPrice,
    trade.outcomePrice,
    trade.units
  ]);

  const packedLibraryPoints = [
    [
      "lib|base|alpha|0",
      "base",
      "Momentum",
      Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      100,
      "Win",
      "London",
      1,
      1,
      [0, 0, 0, 0, 0, 0]
    ]
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: packedTrades,
    panelLibraryPoints: packedLibraryPoints,
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
  assert.equal(stampedTrade.entryNeighbors[0]?.metaUid, "lib|base|alpha|0");
  assert.equal(stampedTrade.closestClusterUid, "lib|base|alpha|0");
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

  const stampedTrade = payload.timeFilteredTrades[3];
  assert.ok(stampedTrade, "expected a stamped trade");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors) && stampedTrade.entryNeighbors.length > 0);
  const firstNeighborUid =
    stampedTrade.entryNeighbors[0]?.metaUid ?? stampedTrade.entryNeighbors[0]?.uid ?? null;
  assert.notEqual(firstNeighborUid, String(stampedTrade.id));
  assert.equal(stampedTrade.closestClusterUid, firstNeighborUid);
});

test("anti-cheat off keeps the full live neighbor pool available", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z",
      neighborVector: [0, 0, 0, 0, 0, 0]
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T02:00:00Z",
      exitIso: "2025-03-01T03:00:00Z",
      result: "Loss",
      pnlUsd: -100,
      pnlPct: -0.2,
      outcomePrice: 99,
      neighborVector: [10, 10, 10, 10, 10, 10]
    }),
    makeTrade({
      id: "live-3",
      entryIso: "2025-03-01T04:00:00Z",
      exitIso: "2025-03-01T05:00:00Z",
      neighborVector: [10, 10, 10, 10, 10, 10]
    })
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: [],
    panelBacktestFilterSettings: baseFilterSettings({
      antiCheatEnabled: false,
      validationMode: "synthetic",
      selectedAiLibraries: ["core"]
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      core: { weight: 100, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a stamped trade");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors) && stampedTrade.entryNeighbors.length > 0);
  const firstNeighborUid =
    stampedTrade.entryNeighbors[0]?.metaUid ?? stampedTrade.entryNeighbors[0]?.uid ?? null;
  const neighborIds = stampedTrade.entryNeighbors
    .map((neighbor: { metaUid?: string | null; uid?: string | null }) => (
      neighbor?.metaUid ?? neighbor?.uid ?? null
    ))
    .filter((value: string | null): value is string => typeof value === "string");

  assert.notEqual(firstNeighborUid, "live-1");
  assert.ok(
    neighborIds.includes("live-2") || neighborIds.includes("live-3"),
    "expected the unrestricted pool to include the selected or future live trade"
  );
  assert.equal(stampedTrade.closestClusterUid, firstNeighborUid);
});

test("online validation excludes future canonical library points from neighbors", async () => {
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
      uid: "lib|base|past|0",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      metaPnl: 100,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [0, 0, 0, 0, 0, 0.02]
    },
    {
      uid: "lib|base|future|1",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-03-01T05:00:00Z") / 1000),
      metaPnl: 100,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [0, 0, 0, 0, 0, 0.01]
    }
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      antiCheatEnabled: true,
      validationMode: "off",
      selectedAiLibraries: ["base"]
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 }
    }
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected an online-evaluated trade");
  assert.ok(Array.isArray(stampedTrade.entryNeighbors) && stampedTrade.entryNeighbors.length > 0);

  const neighborIds = stampedTrade.entryNeighbors
    .map((neighbor: { metaUid?: string | null; uid?: string | null }) => (
      neighbor?.metaUid ?? neighbor?.uid ?? null
    ))
    .filter((value: string | null): value is string => typeof value === "string");

  assert.ok(neighborIds.includes("lib|base|past|0"));
  assert.equal(neighborIds.includes("lib|base|future|1"), false);
  assert.equal(stampedTrade.closestClusterUid, "lib|base|past|0");
  assert.equal(isTradeCheatedByFutureDependency(stampedTrade), false);
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

test("panel analytics nearest-neighbor ranking ignores the query trade outcome when In Precise is on", async () => {
  const buildPayload = async (currentTradeOverrides: {
    result: "Win" | "Loss";
    pnlUsd: number;
    pnlPct: number;
    outcomePrice: number;
  }) =>
    postPanelAnalytics({
      panelSourceTrades: [
        makeTrade({
          id: "live-1",
          entryIso: "2025-03-01T00:00:00Z",
          exitIso: "2025-03-01T01:00:00Z",
          result: "Win",
          pnlUsd: 120,
          pnlPct: 0.2,
          outcomePrice: 101
        }),
        makeTrade({
          id: "live-2",
          entryIso: "2025-03-02T00:00:00Z",
          exitIso: "2025-03-02T01:00:00Z",
          result: "Loss",
          pnlUsd: -120,
          pnlPct: -0.2,
          outcomePrice: 99
        }),
        makeTrade({
          id: "live-3",
          entryIso: "2025-03-03T00:00:00Z",
          exitIso: "2025-03-03T01:00:00Z",
          ...currentTradeOverrides
        })
      ],
      panelLibraryPoints: [],
      panelBacktestFilterSettings: baseFilterSettings({
        antiCheatEnabled: true,
        validationMode: "off",
        selectedAiLibraries: ["core"],
        kEntry: 1,
        inPreciseEnabled: true
      }),
      panelConfidenceGateDisabled: true,
      panelEffectiveConfidenceThreshold: 0,
      aiLibraryDefaultsById: {
        core: { weight: 100, maxSamples: 1000 }
      }
    });

  const winPayload = await buildPayload({
    result: "Win",
    pnlUsd: 140,
    pnlPct: 0.25,
    outcomePrice: 101
  });
  const lossPayload = await buildPayload({
    result: "Loss",
    pnlUsd: -140,
    pnlPct: -0.25,
    outcomePrice: 99
  });

  const stampedWinTrade = winPayload.timeFilteredTrades.find(
    (trade: { id: string }) => trade.id === "live-3"
  );
  const stampedLossTrade = lossPayload.timeFilteredTrades.find(
    (trade: { id: string }) => trade.id === "live-3"
  );

  assert.ok(stampedWinTrade, "expected the win-query trade");
  assert.ok(stampedLossTrade, "expected the loss-query trade");
  assert.equal(stampedWinTrade.closestClusterUid, stampedLossTrade.closestClusterUid);
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

test("panel analytics stamps remapped opposite-direction neighbors as effective losses", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z",
      side: "Long",
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T02:00:00Z",
      exitIso: "2025-03-01T03:00:00Z",
      side: "Long",
      neighborVector: [0, 0, 0, 0, 0, 0],
    }),
  ];

  const libraryPoints = [
    {
      uid: "lib|base|opposite-win|0",
      libId: "base",
      metaTime: Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      metaPnl: 140,
      metaOutcome: "Win",
      metaSession: "London",
      dir: -1,
      label: 1,
      v: [0, 0, 0, 0, 0, 0.01],
    },
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      selectedAiDomains: [],
      kEntry: 1,
      knnVoteMode: "majority",
      remapOppositeOutcomes: true,
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      base: { weight: 100, maxSamples: 1000 },
    },
  });

  const stampedTrade = payload.timeFilteredTrades[1];
  assert.ok(stampedTrade, "expected a second stamped trade");
  assert.equal(stampedTrade.closestClusterUid, "lib|base|opposite-win|0");
  assert.equal(stampedTrade.entryNeighbors[0]?.label, -1);
  assert.equal(stampedTrade.entryNeighbors[0]?.metaOutcome, "Loss");
  assertApprox(Number(stampedTrade.entryConfidence), 0);
});

test("base seeding neighbors still populate when Model domain is selected", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z",
      entrySource: "Mean Reversion",
      side: "Long"
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T02:00:00Z",
      exitIso: "2025-03-01T03:00:00Z",
      entrySource: "Mean Reversion",
      side: "Long",
      neighborVector: [0, 0, 0, 0, 0, 0]
    })
  ];

  const libraryPoints = [
    {
      uid: "lib|base|generic-seed|0",
      libId: "base",
      metaModel: "Base Seeding",
      metaTime: Math.floor(Date.parse("2025-02-28T00:00:00Z") / 1000),
      metaPnl: 140,
      metaOutcome: "Win",
      metaSession: "London",
      dir: 1,
      label: 1,
      v: [0, 0, 0, 0, 0, 0.01]
    }
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: libraryPoints,
    panelBacktestFilterSettings: baseFilterSettings({
      selectedAiLibraries: ["base"],
      selectedAiDomains: ["Direction", "Model"],
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
  assert.ok(Array.isArray(stampedTrade.entryNeighbors), "expected stamped neighbors");
  assert.equal(stampedTrade.entryNeighbors.length, 1);
  assert.equal(stampedTrade.closestClusterUid, "lib|base|generic-seed|0");
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

test("split validation does not silently midpoint-fallback when timestamps collapse to one side", async () => {
  const trades = [
    makeTrade({
      id: "live-1",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T01:00:00Z",
      neighborVector: [0, 0, 0, 0, 0, 0]
    }),
    makeTrade({
      id: "live-2",
      entryIso: "2025-03-01T00:00:00Z",
      exitIso: "2025-03-01T02:00:00Z",
      result: "Loss",
      pnlUsd: -100,
      pnlPct: -0.2,
      outcomePrice: 99,
      neighborVector: [1, 1, 1, 1, 1, 1]
    })
  ];

  const payload = await postPanelAnalytics({
    panelSourceTrades: trades,
    panelLibraryPoints: [],
    panelBacktestFilterSettings: baseFilterSettings({
      antiCheatEnabled: true,
      validationMode: "split",
      statsDateStart: null,
      statsDateEnd: null,
      selectedAiLibraries: ["core"]
    }),
    panelConfidenceGateDisabled: true,
    panelEffectiveConfidenceThreshold: 0,
    aiLibraryDefaultsById: {
      core: { weight: 100, maxSamples: 1000 }
    }
  });

  assert.equal(payload.libraryCandidateTrades.length, 0);
  assert.equal(payload.timeFilteredTrades.length, 2);
});

test("synthetic worker libraries are stamped in 1999 while live trades stay on real-market time", async () => {
  const candles = buildComputeCandles(320);

  const payload = await postAizipCompute({
    candles,
    settings: {
      antiCheatEnabled: true,
      validationMode: "synthetic",
      parseMode: "utc",
      chunkBars: 8,
      dollarsPerMove: 100,
      tpDollars: 100,
      slDollars: 100,
      enabledSessions: {
        Tokyo: true,
        Sydney: true,
        London: true,
        "New York": true
      },
      modelStates: {
        Momentum: 1
      },
      aiLibrariesActive: ["base", "recent"],
      aiLibrariesSettings: {
        base: { weight: 100, maxSamples: 128, tpDollars: 100, slDollars: 100 },
        recent: { weight: 100, maxSamples: 128 }
      }
    },
    timeoutMs: 60_000
  });

  const result =
    payload.res && typeof payload.res === "object" && !Array.isArray(payload.res)
      ? (payload.res as {
          libraryCounts?: Record<string, number>;
          libraryPoints?: Array<{ libId?: string; entryTime?: number; exitTime?: number }>;
          trades?: Array<{ entryTime?: number; exitTime?: number }>;
        })
      : null;
  assert.ok(result, "expected a compute result payload");

  const libraryPoints = Array.isArray(result?.libraryPoints) ? result.libraryPoints : [];
  assert.ok(libraryPoints.length > 0, "expected synthetic library points");
  assert.equal(result?.libraryCounts?.recent ?? 0, 0);

  const basePoints = libraryPoints.filter((point) => point?.libId === "base");
  assert.ok(basePoints.length > 0, "expected base library points");
  for (const point of basePoints.slice(0, 16)) {
    const entryTime = Number(point.entryTime ?? NaN);
    const exitTime = Number(point.exitTime ?? NaN);
    assert.equal(new Date(entryTime).getUTCFullYear(), 1999);
    assert.equal(new Date(exitTime).getUTCFullYear(), 1999);
  }

  const trades = Array.isArray(result?.trades) ? result.trades : [];
  for (const trade of trades.slice(0, 16)) {
    const entryTime = Number(trade.entryTime ?? NaN);
    const exitTime = Number(trade.exitTime ?? NaN);
    assert.equal(new Date(entryTime).getUTCFullYear() >= 2025, true);
    assert.equal(new Date(exitTime).getUTCFullYear() >= 2025, true);
  }
});

test("compute worker does not silently inject the base library when none is selected", async () => {
  const payload = await postAizipCompute({
    candles: buildComputeCandles(240),
    settings: {
      antiCheatEnabled: false,
      validationMode: "off",
      parseMode: "utc",
      chunkBars: 8,
      dollarsPerMove: 100,
      tpDollars: 100,
      slDollars: 100,
      enabledSessions: {
        Tokyo: true,
        Sydney: true,
        London: true,
        "New York": true
      },
      modelStates: {
        Momentum: 1
      },
      aiLibrariesActive: [],
      aiLibrariesSettings: {}
    },
    timeoutMs: 60_000
  });

  const result =
    payload.res && typeof payload.res === "object" && !Array.isArray(payload.res)
      ? (payload.res as {
          libraryCounts?: Record<string, number>;
          libraryPoints?: Array<{ libId?: string }>;
        })
      : null;
  assert.ok(result, "expected a compute result payload");
  assert.equal(result?.libraryCounts?.base ?? 0, 0);
  assert.equal(
    (Array.isArray(result?.libraryPoints) ? result.libraryPoints : []).some(
      (point) => point?.libId === "base"
    ),
    false
  );
});

test("artificial library balancing keeps the generated sample count at maxSamples", async () => {
  const payload = await postAizipCompute({
    candles: buildComputeCandles(360),
    settings: {
      antiCheatEnabled: false,
      validationMode: "off",
      parseMode: "utc",
      chunkBars: 8,
      dollarsPerMove: 100,
      tpDollars: 100,
      slDollars: 100,
      enabledSessions: {
        Tokyo: true,
        Sydney: true,
        London: true,
        "New York": true
      },
      modelStates: {
        Momentum: 1
      },
      aiLibrariesActive: ["base"],
      aiLibrariesSettings: {
        base: {
          weight: 100,
          maxSamples: 7,
          targetWinRateMode: "artificial",
          targetWinRate: 73
        }
      }
    },
    timeoutMs: 60_000
  });

  const result =
    payload.res && typeof payload.res === "object" && !Array.isArray(payload.res)
      ? (payload.res as {
          libraryCounts?: Record<string, number>;
          libraryPoints?: Array<{ libId?: string }>;
        })
      : null;
  assert.ok(result, "expected a compute result payload");
  assert.equal(result?.libraryCounts?.base ?? 0, 7);
  const basePoints = (Array.isArray(result?.libraryPoints) ? result.libraryPoints : []).filter(
    (point) => point?.libId === "base"
  );
  assert.equal(basePoints.length, 7);
});
