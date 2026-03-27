import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { AIZIP_COMPUTE_WORKER_CODE } from "../lib/aizipComputeWorkerCode";

type HdbHarness = {
  setState: (config: {
    candleTimes?: string[];
    countSuppressed?: boolean;
    chronological?: boolean;
    domains?: string[];
    hdbDomainDistinction?: "conceptual" | "real";
    hdbMinClusterSize?: number;
    hdbMinSamples?: number;
    hdbEpsQuantile?: number;
    hdbSampleCap?: number;
  }) => void;
  resolveDataset: (
    points: any[],
    dirFilter: number,
    excludeTime: string | null,
    modelKey: string,
    qMeta: Record<string, unknown> | null
  ) => string[];
  hdbMargin: (
    points: any[],
    q: number[],
    dirFilter: number,
    excludeTime: string | null,
    modelKey: string,
    qMeta: Record<string, unknown> | null,
    queryDir: number
  ) => number;
};

const createHarness = (): HdbHarness => {
  const context: Record<string, unknown> = {
    console,
    Math,
    Date,
    Map,
    Set,
    Array,
    Number,
    String,
    Boolean,
    Object,
    JSON,
    RegExp,
    Infinity,
    NaN,
    parseInt,
    parseFloat,
    isFinite,
    postMessage: () => undefined
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(
    `${AIZIP_COMPUTE_WORKER_CODE}
globalThis.__aizipHdbHarness = {
  setState(config){
    CHRONOLOGICAL_NEIGHBOR_FILTER = !!config.chronological;
    COUNT_SUPPRESSED_NEIGHBORS = config.countSuppressed !== false;
    DOMAIN_SET =
      Array.isArray(config.domains) && config.domains.length
        ? new Set(config.domains)
        : null;
    HDB_DOMAIN_DISTINCTION =
      config.hdbDomainDistinction === "conceptual" ? "conceptual" : "real";
    if (Number.isFinite(config.hdbMinClusterSize)) HDB_MIN_CLUSTER_SIZE = Number(config.hdbMinClusterSize);
    if (Number.isFinite(config.hdbMinSamples)) HDB_MIN_SAMPLES = Number(config.hdbMinSamples);
    if (Number.isFinite(config.hdbEpsQuantile)) HDB_EPS_QUANTILE = Number(config.hdbEpsQuantile);
    if (Number.isFinite(config.hdbSampleCap)) HDB_SAMPLE_CAP = Number(config.hdbSampleCap);
    CANDLE_INDEX_BY_TIME = new Map(
      Array.isArray(config.candleTimes)
        ? config.candleTimes.map((time, index) => [String(time), index])
        : []
    );
    HDB_CACHE.clear();
  },
  resolveDataset(points, dirFilter, excludeTime, modelKey, qMeta){
    let usable = filterUsableNeighbors(points, excludeTime);
    if(!COUNT_SUPPRESSED_NEIGHBORS) usable = usable.filter((point) => !point.metaSuppressed);
    const queryMeta = buildHdbQueryMeta(qMeta, modelKey);
    const dataset =
      HDB_DOMAIN_DISTINCTION === "real"
        ? filterAiDomainUsablePoints(usable, dirFilter, modelKey, queryMeta)
        : usable;
    return dataset.map((point) => String(point.uid ?? point.id ?? ""));
  },
  hdbMargin(points, q, dirFilter, excludeTime, modelKey, qMeta, queryDir){
    return hdbscanMargin(points, q, "entry", dirFilter, excludeTime, modelKey, qMeta, queryDir);
  }
};`,
    context
  );
  return context.__aizipHdbHarness as HdbHarness;
};

const makePoint = (params: {
  uid: string;
  dir: number;
  label: number;
  vector: number[];
  time?: string;
  session?: string;
  model?: string;
}) => ({
  uid: params.uid,
  dir: params.dir,
  label: params.label,
  metaTime: params.time ?? "2025-03-01T07:00:00.000Z",
  metaSession: params.session ?? "London",
  metaModel: params.model ?? "Momentum",
  v: params.vector
});

test("hdb real distinction filters the clustering dataset by the active domains", () => {
  const harness = createHarness();
  harness.setState({
    domains: ["Direction", "Model", "Session", "Hour"],
    hdbDomainDistinction: "real",
    countSuppressed: true
  });

  const dataset = harness.resolveDataset(
    [
      makePoint({
        uid: "match",
        dir: 1,
        label: 1,
        vector: [0, 0],
        time: "2025-03-01T07:00:00.000Z",
        session: "London",
        model: "Momentum"
      }),
      makePoint({
        uid: "wrong-dir",
        dir: -1,
        label: 1,
        vector: [0.1, 0],
        time: "2025-03-01T07:00:00.000Z",
        session: "London",
        model: "Momentum"
      }),
      makePoint({
        uid: "wrong-model",
        dir: 1,
        label: 1,
        vector: [0.2, 0],
        time: "2025-03-01T07:00:00.000Z",
        session: "London",
        model: "Fibonacci"
      }),
      makePoint({
        uid: "wrong-hour",
        dir: 1,
        label: 1,
        vector: [0.3, 0],
        time: "2025-03-01T08:00:00.000Z",
        session: "London",
        model: "Momentum"
      }),
      makePoint({
        uid: "wrong-session",
        dir: 1,
        label: 1,
        vector: [0.4, 0],
        time: "2025-03-01T07:00:00.000Z",
        session: "New York",
        model: "Momentum"
      })
    ],
    1,
    null,
    "Momentum",
    {
      session: "London",
      month: 3,
      dow: 6,
      hour: 7
    }
  );

  assert.deepEqual(dataset, ["match"]);
});

test("hdb conceptual distinction stays conservative when a cluster has no matching domain slice", () => {
  const points = [
    makePoint({ uid: "sell-win-1", dir: -1, label: 1, vector: [0, 0] }),
    makePoint({ uid: "sell-win-2", dir: -1, label: 1, vector: [0.06, 0] }),
    makePoint({ uid: "sell-win-3", dir: -1, label: 1, vector: [0, 0.06] }),
    makePoint({ uid: "buy-loss-1", dir: 1, label: -1, vector: [10, 10] }),
    makePoint({ uid: "buy-loss-2", dir: 1, label: -1, vector: [10.06, 10] }),
    makePoint({ uid: "buy-loss-3", dir: 1, label: -1, vector: [10, 10.06] })
  ];
  const queryMeta = {
    session: "London",
    month: 3,
    dow: 6,
    hour: 7
  };

  const conceptualHarness = createHarness();
  conceptualHarness.setState({
    domains: ["Direction"],
    hdbDomainDistinction: "conceptual",
    hdbMinClusterSize: 2,
    hdbMinSamples: 2,
    hdbEpsQuantile: 0.5,
    hdbSampleCap: 64,
    countSuppressed: true
  });

  const conceptualScore = conceptualHarness.hdbMargin(
    points,
    [0, 0],
    1,
    null,
    "Momentum",
    queryMeta,
    1
  );

  assert.equal(Number.isNaN(conceptualScore), true);

  const realHarness = createHarness();
  realHarness.setState({
    domains: ["Direction"],
    hdbDomainDistinction: "real",
    hdbMinClusterSize: 2,
    hdbMinSamples: 2,
    hdbEpsQuantile: 0.5,
    hdbSampleCap: 64,
    countSuppressed: true
  });

  const realScore = realHarness.hdbMargin(
    points,
    [0, 0],
    1,
    null,
    "Momentum",
    queryMeta,
    1
  );

  assert.equal(realScore, 0);
});
