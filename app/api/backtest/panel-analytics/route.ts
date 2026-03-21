import { NextResponse } from "next/server";
import type {
  BacktestEntryNeighbor,
  BacktestTradeAiEntryMeta,
  BacktestTradeAiMode
} from "../../../backtestHistoryShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AiLibrarySettingValue = boolean | number | string;
type AiLibrarySettings = Record<string, Record<string, AiLibrarySettingValue>>;
type AiDistanceMetric =
  | "euclidean"
  | "cosine"
  | "manhattan"
  | "chebyshev"
  | "mahalanobis";
type KnnNeighborSpace = "high" | "post" | "3d" | "2d";
type KnnVoteMode = "distance" | "majority";

type HistoryItem = {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  result: "Win" | "Loss";
  entrySource: string;
  exitReason: string;
  pnlPct: number;
  pnlUsd: number;
  time: string;
  entryAt: string;
  exitAt: string;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
  neighborVector?: number[] | null;
} & BacktestTradeAiEntryMeta;

type TradeAiEntrySnapshot = {
  entryConfidence: number;
  confidence: number;
  entryMargin: number;
  margin: number;
  aiMode: Exclude<BacktestTradeAiMode, "off">;
  closestClusterUid: string | null;
  entryNeighbors: BacktestEntryNeighbor[];
};

type LibraryPointPayload = {
  id?: string;
  uid?: string;
  libId?: string;
  model?: string | null;
  metaModel?: string | null;
  entryTime?: number | null;
  metaTime?: number | null;
  pnl?: number | null;
  metaPnl?: number | null;
  result?: string | null;
  metaOutcome?: string | null;
  metaSession?: string | null;
  dir?: number | null;
  label?: number | null;
  v?: number[] | null;
};

type LibrarySourceCandidate = {
  uid: string;
  libraryId: string;
  sourceIndex: number;
  direction: number | null;
  entryTime: number | null;
  pnlUsd: number | null;
  result: string | null;
  session: string | null;
  entryModel: string | null;
  label: number | null;
  trade: HistoryItem | null;
  vector: number[] | null;
};

type LibraryNeighborAggregateEntry = {
  candidate: LibrarySourceCandidate;
  distance: number;
  voteWeight: number;
  effectiveLabel: number | null;
  outcomeScore: number;
};

type BacktestFilterSettings = {
  statsDateStart: string;
  statsDateEnd: string;
  enabledBacktestWeekdays: string[];
  enabledBacktestSessions: string[];
  enabledBacktestMonths: number[];
  enabledBacktestHours: number[];
  aiMode: "off" | "knn" | "hdbscan";
  antiCheatEnabled: boolean;
  validationMode: "off" | "split" | "synthetic";
  selectedAiLibraries: string[];
  selectedAiLibrarySettings: AiLibrarySettings;
  distanceMetric: AiDistanceMetric;
  knnNeighborSpace: KnnNeighborSpace;
  kEntry: number;
  knnVoteMode: KnnVoteMode;
  selectedAiDomains: string[];
  remapOppositeOutcomes?: boolean;
};

type PanelAnalyticsResponseBody = {
  dateFilteredTrades: HistoryItem[];
  libraryCandidateTrades: HistoryItem[];
  timeFilteredTrades: HistoryItem[];
  confidenceByIdEntries: Array<[string, number]>;
  chartPanelHistoryRows: HistoryItem[];
  activePanelHistoryRows: HistoryItem[];
};

const AI_LIBRARY_TARGET_WIN_RATE_KEY = "targetWinRate";
const AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY = "targetWinRateMode";

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const AI_EPS = 1e-8;

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const toFiniteVector = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const vector = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));

  return vector.length > 0 ? vector : null;
};

const dotProduct = (left: number[], right: number[]) => {
  let total = 0;
  const dim = Math.min(left.length, right.length);
  for (let index = 0; index < dim; index += 1) {
    total += left[index]! * right[index]!;
  }
  return total;
};

const vectorNorm = (value: number[]) => {
  return Math.sqrt(Math.max(AI_EPS, dotProduct(value, value)));
};

const matrixVector = (matrix: number[][], vector: number[]) => {
  return matrix.map((row) => dotProduct(row, vector));
};

const randomNormal = (seedFactory: () => number) => {
  let u = 0;
  let v = 0;
  while (u <= AI_EPS) {
    u = seedFactory();
  }
  while (v <= AI_EPS) {
    v = seedFactory();
  }
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const createSeededRng = (seed: number) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

type PcaBasis = {
  mean: number[];
  components: number[][];
};

const fitPcaBasis = (vectors: number[][], outDim: number, cacheKey: string): PcaBasis | null => {
  if (vectors.length === 0 || outDim <= 0) {
    return null;
  }

  const inDim = vectors[0]?.length ?? 0;
  if (inDim <= 0) {
    return null;
  }

  const mean = new Array(inDim).fill(0);
  for (const vector of vectors) {
    if (vector.length !== inDim) {
      return null;
    }
    for (let index = 0; index < inDim; index += 1) {
      mean[index] += vector[index]!;
    }
  }
  for (let index = 0; index < inDim; index += 1) {
    mean[index] /= Math.max(1, vectors.length);
  }

  const covariance = Array.from({ length: inDim }, () => new Array(inDim).fill(0));
  for (const vector of vectors) {
    for (let left = 0; left < inDim; left += 1) {
      const leftValue = vector[left]! - mean[left]!;
      for (let right = 0; right < inDim; right += 1) {
        covariance[left]![right] += leftValue * (vector[right]! - mean[right]!);
      }
    }
  }
  const denominator = Math.max(1, vectors.length - 1);
  for (let left = 0; left < inDim; left += 1) {
    for (let right = 0; right < inDim; right += 1) {
      covariance[left]![right] /= denominator;
    }
  }

  const rng = createSeededRng(hashSeedFromText(cacheKey));
  const work = covariance.map((row) => row.slice());
  const components: number[][] = [];
  const targetDim = Math.min(outDim, inDim);

  for (let componentIndex = 0; componentIndex < targetDim; componentIndex += 1) {
    let vector = Array.from({ length: inDim }, () => randomNormal(rng));
    let currentNorm = vectorNorm(vector);
    vector = vector.map((entry) => entry / currentNorm);

    for (let iteration = 0; iteration < 12; iteration += 1) {
      const next = matrixVector(work, vector);
      currentNorm = vectorNorm(next);
      vector = next.map((entry) => entry / currentNorm);
    }

    const projected = matrixVector(work, vector);
    const eigenValue = dotProduct(vector, projected);
    components.push(vector.slice());

    for (let left = 0; left < inDim; left += 1) {
      for (let right = 0; right < inDim; right += 1) {
        work[left]![right] -= eigenValue * vector[left]! * vector[right]!;
      }
    }
  }

  return components.length > 0 ? { mean, components } : null;
};

const applyPcaBasis = (basis: PcaBasis, vector: number[]) => {
  const centered = vector.map((entry, index) => entry - (basis.mean[index] ?? 0));
  return basis.components.map((component) => dotProduct(component, centered));
};

const computeVectorVariance = (vectors: number[][]): number[] | null => {
  if (vectors.length === 0) {
    return null;
  }

  const dim = vectors[0]?.length ?? 0;
  if (dim <= 0) {
    return null;
  }

  const mean = new Array(dim).fill(0);
  const variance = new Array(dim).fill(0);

  for (const vector of vectors) {
    if (vector.length !== dim) {
      return null;
    }
    for (let index = 0; index < dim; index += 1) {
      mean[index] += vector[index]!;
    }
  }

  for (let index = 0; index < dim; index += 1) {
    mean[index] /= Math.max(1, vectors.length);
  }

  for (const vector of vectors) {
    for (let index = 0; index < dim; index += 1) {
      const delta = vector[index]! - mean[index]!;
      variance[index] += delta * delta;
    }
  }

  for (let index = 0; index < dim; index += 1) {
    variance[index] = Math.max(AI_EPS, variance[index]! / Math.max(1, vectors.length - 1));
  }

  return variance;
};

const normalizeDistanceMetric = (value: unknown): AiDistanceMetric => {
  return value === "cosine" ||
    value === "manhattan" ||
    value === "chebyshev" ||
    value === "mahalanobis"
    ? value
    : "euclidean";
};

const normalizeKnnNeighborSpace = (value: unknown): KnnNeighborSpace => {
  return value === "high" || value === "3d" || value === "2d" ? value : "post";
};

const normalizeKnnVoteMode = (value: unknown): KnnVoteMode => {
  void value;
  return "majority";
};

const hashSeedFromText = (seedText: string): number => {
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 33 + seedText.charCodeAt(i)) >>> 0;
  }
  return seed;
};

const getUtcDayStartMs = (ymd: string): number | null => {
  if (!ymd) {
    return null;
  }

  const value = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(value) ? value : null;
};

const getUtcDayEndExclusiveMs = (ymd: string): number | null => {
  const startMs = getUtcDayStartMs(ymd);
  if (startMs === null) {
    return null;
  }

  return startMs + 86_400_000;
};

const getTradeDayKey = (timestampSeconds: number): string => {
  return new Date(Number(timestampSeconds) * 1000).toISOString().slice(0, 10);
};

const getTradeMonthIndex = (timestampSeconds: number): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCMonth();
};

const getTradeHour = (timestampSeconds: number): number => {
  return new Date(Number(timestampSeconds) * 1000).getUTCHours();
};

const getWeekdayLabel = (dateKey: string): string => {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC"
  });
};

const getSessionLabel = (timestampSeconds: number): string => {
  const date = new Date(Number(timestampSeconds) * 1000);

  if (Number.isNaN(date.getTime())) {
    return "Sydney";
  }

  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;

  if (hour >= 16 || hour < 1) {
    return "Tokyo";
  }

  if (hour >= 12 && hour < 21) {
    return "Sydney";
  }

  if (hour >= 0 && hour < 9) {
    return "London";
  }

  if (hour >= 5 && hour < 14) {
    return "New York";
  }

  return "London";
};

const getTradeRiskReward = (trade: HistoryItem) => {
  const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
  const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
  return rewardDistance / riskDistance;
};

const buildTradeNeighborVector = (trade: HistoryItem): number[] => {
  const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
  const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
  const holdMinutes = Math.max(1, Number(trade.exitTime) - Number(trade.entryTime));
  const entryTime = Number(trade.entryTime);

  return [
    trade.side === "Long" ? 1 : -1,
    clamp(Number(trade.pnlPct) / 100, -8, 8),
    clamp(Number(trade.pnlUsd) / 1000, -8, 8),
    clamp(rewardDistance / riskDistance, 0, 12),
    clamp(holdMinutes / 60, 0, 96),
    (((entryTime % 86_400) + 86_400) % 86_400) / 86_400
  ];
};

const getTradeDirection = (trade: HistoryItem): number => {
  return trade.side === "Short" ? -1 : 1;
};

type QueryDomainMeta = {
  session: string | null;
  month: number | null;
  dow: number | null;
  hour: number | null;
};

const getTradeQueryMeta = (entryTimeSeconds: number): QueryDomainMeta => {
  const timestampMs = Number(entryTimeSeconds) * 1000;
  const date = new Date(timestampMs);

  if (Number.isNaN(date.getTime())) {
    return {
      session: null,
      month: null,
      dow: null,
      hour: null
    };
  }

  return {
    session: getSessionLabel(entryTimeSeconds),
    month: date.getUTCMonth() + 1,
    dow: date.getUTCDay(),
    hour: date.getUTCHours()
  };
};

const getCandidateQueryMeta = (candidate: LibrarySourceCandidate): QueryDomainMeta => {
  if (candidate.entryTime == null) {
    return {
      session: candidate.session ?? null,
      month: null,
      dow: null,
      hour: null
    };
  }

  const timeMeta = getTradeQueryMeta(candidate.entryTime);
  return {
    ...timeMeta,
    session: candidate.session ?? timeMeta.session
  };
};

const candidatePassesAiDomains = (
  candidate: LibrarySourceCandidate,
  trade: HistoryItem,
  selectedDomains: Set<string>,
  queryMeta: QueryDomainMeta
) => {
  if (selectedDomains.size === 0) {
    return true;
  }

  if (selectedDomains.has("Direction")) {
    if (candidate.direction == null || candidate.direction !== getTradeDirection(trade)) {
      return false;
    }
  }

  if (selectedDomains.has("Model")) {
    const queryModel = String(trade.entrySource ?? "").trim();
    const candidateModel = String(candidate.entryModel ?? "").trim();
    const candidateUsesGenericBaseModel =
      (candidate.libraryId === "base" ||
        candidate.libraryId === "tokyo" ||
        candidate.libraryId === "sydney" ||
        candidate.libraryId === "london" ||
        candidate.libraryId === "newyork") &&
      (!candidateModel || candidateModel.toLowerCase() === "base seeding");
    if (!candidateUsesGenericBaseModel && (!queryModel || candidateModel !== queryModel)) {
      return false;
    }
  }

  const candidateMeta = getCandidateQueryMeta(candidate);

  if (selectedDomains.has("Session") && queryMeta.session != null) {
    if (candidateMeta.session !== queryMeta.session) {
      return false;
    }
  }

  if (selectedDomains.has("Month") && queryMeta.month != null) {
    if (candidateMeta.month !== queryMeta.month) {
      return false;
    }
  }

  if (selectedDomains.has("Weekday") && queryMeta.dow != null) {
    if (candidateMeta.dow !== queryMeta.dow) {
      return false;
    }
  }

  if (selectedDomains.has("Hour") && queryMeta.hour != null) {
    if (candidateMeta.hour !== queryMeta.hour) {
      return false;
    }
  }

  return true;
};

const computeNeighborVoteWeight = (baseWeight: number) => {
  const resolvedBaseWeight =
    Number.isFinite(baseWeight) && baseWeight > 0 ? baseWeight : 1;
  return resolvedBaseWeight;
};

const getVectorDistance = (
  left: number[],
  right: number[],
  metric: AiDistanceMetric,
  variance: number[] | null
) => {
  const dim = Math.min(left.length, right.length);
  if (dim <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (metric === "cosine") {
    const dot = dotProduct(left, right);
    const denom = vectorNorm(left) * vectorNorm(right);
    if (!Number.isFinite(denom) || denom <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return 1 - dot / denom;
  }

  if (metric === "manhattan") {
    let total = 0;
    for (let index = 0; index < dim; index += 1) {
      total += Math.abs(left[index]! - right[index]!);
    }
    return total;
  }

  if (metric === "chebyshev") {
    let maxDistance = 0;
    for (let index = 0; index < dim; index += 1) {
      maxDistance = Math.max(maxDistance, Math.abs(left[index]! - right[index]!));
    }
    return maxDistance;
  }

  if (metric === "mahalanobis") {
    let total = 0;
    for (let index = 0; index < dim; index += 1) {
      const delta = left[index]! - right[index]!;
      const varianceForDim =
        variance && Number.isFinite(variance[index])
          ? Math.max(AI_EPS, variance[index]!)
          : 1;
      total += (delta * delta) / varianceForDim;
    }
    return Math.sqrt(total);
  }

  let total = 0;
  for (let index = 0; index < dim; index += 1) {
    const delta = left[index]! - right[index]!;
    total += delta * delta;
  }
  return Math.sqrt(total);
};

const getAiLibraryTargetWinRateMode = (
  value: AiLibrarySettingValue | undefined
): "natural" | "artificial" => {
  return value === "artificial" ? "artificial" : "natural";
};

const getNaturalAiLibraryTargetWinRate = (
  baselineWinRate: number,
  loadedNeighborCount: number
): number => {
  if (loadedNeighborCount <= 0 || !Number.isFinite(baselineWinRate)) {
    return 50;
  }

  return clamp(baselineWinRate, 0, 100);
};

const resolveAiLibraryTargetWinRate = (
  settings: Record<string, AiLibrarySettingValue>,
  baselineWinRate: number,
  loadedNeighborCount: number
): number => {
  const mode = getAiLibraryTargetWinRateMode(settings[AI_LIBRARY_TARGET_WIN_RATE_MODE_KEY]);

  if (mode === "natural") {
    return getNaturalAiLibraryTargetWinRate(baselineWinRate, loadedNeighborCount);
  }

  const rawTargetWinRate = Number(settings[AI_LIBRARY_TARGET_WIN_RATE_KEY]);
  return Number.isFinite(rawTargetWinRate)
    ? clamp(rawTargetWinRate, 0, 100)
    : clamp(baselineWinRate, 0, 100);
};

const getOutcomeWinRatePercent = <T,>(
  items: readonly T[],
  isWin: (item: T) => boolean
): number => {
  if (items.length === 0) {
    return 50;
  }

  let wins = 0;

  for (const item of items) {
    if (isWin(item)) {
      wins += 1;
    }
  }

  return (wins / items.length) * 100;
};

const findTargetBalancedOutcomeCounts = (
  winCount: number,
  lossCount: number,
  maxSamples: number,
  targetWinRatePercent: number
) => {
  const availableWins = Math.max(0, Math.floor(Number(winCount) || 0));
  const availableLosses = Math.max(0, Math.floor(Number(lossCount) || 0));
  const totalCap = Math.min(
    Math.max(0, Math.floor(Number(maxSamples) || 0)),
    availableWins + availableLosses
  );

  if (totalCap <= 0) {
    return { winCount: 0, lossCount: 0 };
  }

  const target = clamp(targetWinRatePercent, 0, 100) / 100;
  let bestWins = 0;
  let bestTotal = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let total = totalCap; total >= 1; total -= 1) {
    const minWins = Math.max(0, total - availableLosses);
    const maxWins = Math.min(availableWins, total);
    let candidateWins = Math.round(target * total);
    candidateWins = clamp(candidateWins, minWins, maxWins);
    const diff = Math.abs(candidateWins / total - target);

    if (diff < bestDiff - 1e-9) {
      bestDiff = diff;
      bestWins = candidateWins;
      bestTotal = total;
    }
  }

  return {
    winCount: bestWins,
    lossCount: Math.max(0, bestTotal - bestWins)
  };
};

const rebalanceItemsToTargetWinRate = <T,>(
  items: readonly T[],
  maxSamples: number,
  targetWinRatePercent: number,
  isWin: (item: T) => boolean,
  preferFront = false
): T[] => {
  const cap = Math.max(0, Math.floor(Number(maxSamples) || 0));

  if (cap <= 0 || items.length === 0) {
    return [];
  }

  const indexedItems = items.map((item, index) => ({
    item,
    index,
    win: isWin(item)
  }));
  const orderedItems = preferFront ? indexedItems : [...indexedItems].reverse();
  const wins = orderedItems.filter((entry) => entry.win);
  const losses = orderedItems.filter((entry) => !entry.win);
  const balancedCounts = findTargetBalancedOutcomeCounts(
    wins.length,
    losses.length,
    cap,
    targetWinRatePercent
  );

  return [...wins.slice(0, balancedCounts.winCount), ...losses.slice(0, balancedCounts.lossCount)]
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.item);
};

const collectCappedItems = <T,>(
  items: readonly T[],
  options: {
    cap: number;
    stride?: number;
    predicate?: (item: T, index: number) => boolean;
    startIndex?: number;
    endIndex?: number;
  }
): T[] => {
  const cap = Math.max(0, Math.floor(Number(options.cap) || 0));
  if (cap <= 0 || items.length === 0) {
    return [];
  }

  const stride = Math.max(1, Math.floor(Number(options.stride) || 1));
  const startIndex = clamp(
    Math.floor(Number(options.startIndex ?? 0) || 0),
    0,
    items.length
  );
  const endIndex = clamp(
    Math.floor(Number(options.endIndex ?? items.length) || items.length),
    startIndex,
    items.length
  );
  const predicate = options.predicate ?? (() => true);
  const out: T[] = [];
  let matchedCount = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const item = items[index]!;
    if (!predicate(item, index)) {
      continue;
    }

    if (matchedCount % stride === 0) {
      out.push(item);
      if (out.length >= cap) {
        break;
      }
    }

    matchedCount += 1;
  }

  return out;
};

const applyStrideToItems = <T,>(items: readonly T[], strideRaw: number): T[] => {
  const stride = Math.max(1, Math.floor(Number(strideRaw) || 1));
  if (stride <= 1) {
    return [...items];
  }

  const out: T[] = [];
  for (let index = 0; index < items.length; index += stride) {
    out.push(items[index]!);
  }

  return out;
};

type PreparedCandidateVectorSpace = {
  candidates: Array<number[] | null>;
  queryVector: number[] | null;
  variance: number[] | null;
};

type StaticCandidateVectorSpace = {
  candidates: Array<number[] | null>;
  variance: number[] | null;
  projectQuery: (queryVector: number[]) => number[] | null;
};

const buildStaticCandidateVectorSpace = (
  source: Array<{ candidate: LibrarySourceCandidate; sourceIndex: number; libraryId: string }>,
  settings: BacktestFilterSettings
): StaticCandidateVectorSpace => {
  const space = normalizeKnnNeighborSpace(settings.knnNeighborSpace);
  const rawCandidateVectors = source.map((entry) => entry.candidate.vector);
  const usableVectors = rawCandidateVectors.filter(
    (vector): vector is number[] => Array.isArray(vector) && vector.length > 0
  );

  const nullQuery = () => null;

  if (usableVectors.length === 0) {
    return {
      candidates: rawCandidateVectors.map(() => null),
      variance: null,
      projectQuery: nullQuery
    };
  }

  const baseDim = usableVectors[0]?.length ?? 0;
  const compatibleVectors = usableVectors.filter((vector) => vector.length === baseDim);
  if (compatibleVectors.length === 0) {
    return {
      candidates: rawCandidateVectors.map(() => null),
      variance: null,
      projectQuery: nullQuery
    };
  }

  if (space === "high") {
    const candidates = rawCandidateVectors.map((vector) =>
      Array.isArray(vector) && vector.length === baseDim ? vector : null
    );
    return {
      candidates,
      variance: computeVectorVariance(compatibleVectors),
      projectQuery: (queryVector: number[]) =>
        queryVector.length === baseDim ? queryVector : null
    };
  }

  const mean = new Array(baseDim).fill(0);
  const std = new Array(baseDim).fill(0);

  for (const vector of compatibleVectors) {
    for (let index = 0; index < baseDim; index += 1) {
      mean[index] += vector[index]!;
    }
  }
  for (let index = 0; index < baseDim; index += 1) {
    mean[index] /= Math.max(1, compatibleVectors.length);
  }
  for (const vector of compatibleVectors) {
    for (let index = 0; index < baseDim; index += 1) {
      const delta = vector[index]! - mean[index]!;
      std[index] += delta * delta;
    }
  }
  for (let index = 0; index < baseDim; index += 1) {
    std[index] = Math.sqrt(Math.max(AI_EPS, std[index]! / Math.max(1, compatibleVectors.length)));
  }

  const standardize = (vector: number[]) =>
    vector.map((entry, index) => (entry - mean[index]!) / Math.max(AI_EPS, std[index]!));

  const standardizedCandidates = rawCandidateVectors.map((vector) =>
    Array.isArray(vector) && vector.length === baseDim ? standardize(vector) : null
  );

  if (space === "post") {
    const usableStandardized = standardizedCandidates.filter(
      (vector): vector is number[] => Array.isArray(vector) && vector.length === baseDim
    );
    return {
      candidates: standardizedCandidates,
      variance: computeVectorVariance(usableStandardized),
      projectQuery: (queryVector: number[]) =>
        queryVector.length === baseDim ? standardize(queryVector) : null
    };
  }

  const targetDim = space === "2d" ? 2 : 3;
  const pcaSource = standardizedCandidates.filter(
    (vector): vector is number[] => Array.isArray(vector) && vector.length === baseDim
  );

  if (pcaSource.length < targetDim + 1) {
    return {
      candidates: standardizedCandidates,
      variance: computeVectorVariance(pcaSource),
      projectQuery: (queryVector: number[]) =>
        queryVector.length === baseDim ? standardize(queryVector) : null
    };
  }

  const basis = fitPcaBasis(
    pcaSource,
    targetDim,
    `${space}|${source.length}|${source[0]?.candidate.uid ?? "none"}|${source[source.length - 1]?.candidate.uid ?? "none"}`
  );
  if (!basis) {
    return {
      candidates: standardizedCandidates,
      variance: computeVectorVariance(pcaSource),
      projectQuery: (queryVector: number[]) =>
        queryVector.length === baseDim ? standardize(queryVector) : null
    };
  }

  const projectedCandidates = standardizedCandidates.map((vector) =>
    Array.isArray(vector) && vector.length === baseDim ? applyPcaBasis(basis, vector) : null
  );
  const projectedUsable = projectedCandidates.filter(
    (vector): vector is number[] => Array.isArray(vector) && vector.length === targetDim
  );

  return {
    candidates: projectedCandidates,
    variance: computeVectorVariance(projectedUsable),
    projectQuery: (queryVector: number[]) => {
      if (queryVector.length !== baseDim) {
        return null;
      }
      return applyPcaBasis(basis, standardize(queryVector));
    }
  };
};

const prepareCandidateVectorSpace = (
  currentTrade: HistoryItem,
  source: Array<{ candidate: LibrarySourceCandidate; sourceIndex: number; libraryId: string }>,
  settings: BacktestFilterSettings
): PreparedCandidateVectorSpace => {
  const space = normalizeKnnNeighborSpace(settings.knnNeighborSpace);
  const rawQueryVector = currentTrade.neighborVector ?? buildTradeNeighborVector(currentTrade);
  const staticSpace = buildStaticCandidateVectorSpace(source, settings);

  return {
    candidates: staticSpace.candidates,
    queryVector: staticSpace.projectQuery(rawQueryVector),
    variance: staticSpace.variance
  };
};

const getTradeConfidenceScore = (trade: HistoryItem): number => {
  const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
  const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
  const rrScore = clamp(rewardDistance / riskDistance / 3, 0, 1) * 0.2;
  const pnlScore = clamp(Math.abs(trade.pnlPct) / 0.45, 0, 1) * 0.18;
  const durationMinutes = Math.max(1, (Number(trade.exitTime) - Number(trade.entryTime)) / 60);
  const durationScore = clamp(1 - durationMinutes / 720, 0, 1) * 0.08;
  const base = trade.result === "Win" ? 0.44 : 0.26;
  const sideBias = trade.side === "Long" ? 0.04 : 0.02;

  return clamp(base + rrScore + pnlScore + durationScore + sideBias, 0.05, 0.96);
};

const toNumeric = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeTradeAiMode = (value: unknown): BacktestTradeAiMode | null => {
  return value === "knn" || value === "hdbscan" || value === "off" ? value : null;
};

const cloneEntryNeighbors = (value: unknown): BacktestEntryNeighbor[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: BacktestEntryNeighbor[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const row = item as Record<string, unknown>;
    const tradeRef =
      row.t && typeof row.t === "object" && !Array.isArray(row.t)
        ? (row.t as Record<string, unknown>)
        : null;
    const uid =
      row.metaUid ??
      row.uid ??
      tradeRef?.uid ??
      tradeRef?.tradeUid ??
      tradeRef?.id ??
      null;
    const dir = Number(row.dir ?? tradeRef?.direction ?? NaN);
    const label = Number(row.label ?? NaN);
    const d = Number(row.d ?? NaN);
    const w = Number(row.w ?? NaN);
    const metaTime = Number(row.metaTime ?? tradeRef?.entryTime ?? NaN);
    const metaPnl = Number(row.metaPnl ?? tradeRef?.pnl ?? NaN);

    out.push({
      uid: uid == null ? null : String(uid),
      metaUid: uid == null ? null : String(uid),
      metaTime: Number.isFinite(metaTime) ? metaTime : null,
      metaPnl: Number.isFinite(metaPnl) ? metaPnl : null,
      metaOutcome:
        tradeRef?.result != null
          ? String(tradeRef.result)
          : row.metaOutcome != null
            ? String(row.metaOutcome)
            : null,
      metaSession:
        tradeRef?.session != null
          ? String(tradeRef.session)
          : row.metaSession != null
            ? String(row.metaSession)
            : null,
      dir: Number.isFinite(dir) ? dir : null,
      label: Number.isFinite(label) ? label : null,
      d: Number.isFinite(d) ? d : null,
      w: Number.isFinite(w) ? w : null,
      t: tradeRef
        ? {
            id: tradeRef.id != null ? String(tradeRef.id) : undefined,
            uid:
              tradeRef.uid != null
                ? String(tradeRef.uid)
                : uid == null
                  ? undefined
                  : String(uid),
            tradeUid:
              tradeRef.tradeUid != null
                ? String(tradeRef.tradeUid)
                : uid == null
                  ? undefined
                  : String(uid),
            direction: Number.isFinite(Number(tradeRef.direction))
              ? Number(tradeRef.direction)
              : Number.isFinite(dir)
                ? dir
                : undefined,
            entryTime: Number.isFinite(Number(tradeRef.entryTime))
              ? Number(tradeRef.entryTime)
              : Number.isFinite(metaTime)
                ? metaTime
                : undefined,
            pnl: Number.isFinite(Number(tradeRef.pnl))
              ? Number(tradeRef.pnl)
              : Number.isFinite(metaPnl)
                ? metaPnl
                : undefined,
            result: tradeRef.result != null ? String(tradeRef.result) : undefined,
            session: tradeRef.session != null ? String(tradeRef.session) : undefined,
            entryModel:
              tradeRef.entryModel != null ? String(tradeRef.entryModel) : undefined,
            chunkType:
              tradeRef.chunkType != null ? String(tradeRef.chunkType) : undefined,
            model: tradeRef.model != null ? String(tradeRef.model) : undefined,
            side:
              tradeRef.side === "Short"
                ? "Short"
                : tradeRef.side === "Long"
                  ? "Long"
                  : undefined
          }
        : uid == null
          ? undefined
          : {
              id: String(uid),
              uid: String(uid),
              tradeUid: String(uid)
            }
    });
  }

  return out;
};

const buildLibraryNeighborUid = (
  libraryId: string,
  candidateTrade: HistoryItem,
  sourceIndex: number
): string | null => {
  const candidateId = String(candidateTrade.id ?? "").trim();
  if (!candidateId) {
    return null;
  }

  const normalizedLibraryId = String(libraryId ?? "").trim().toLowerCase();
  if (
    !normalizedLibraryId ||
    normalizedLibraryId === "trades" ||
    normalizedLibraryId === "core"
  ) {
    return candidateId;
  }

  return `lib|${normalizedLibraryId}|${candidateId}|${Math.max(0, Math.floor(sourceIndex) || 0)}`;
};

const normalizeOutcomeLabel = (value: unknown): "Win" | "Loss" | null => {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) {
    return null;
  }
  if (raw === "WIN" || raw === "TP") {
    return "Win";
  }
  if (raw === "LOSS" || raw === "SL") {
    return "Loss";
  }
  return null;
};

const buildTradeSourceCandidate = (
  libraryId: string,
  trade: HistoryItem,
  sourceIndex: number
): LibrarySourceCandidate | null => {
  const uid = buildLibraryNeighborUid(libraryId, trade, sourceIndex);
  if (!uid) {
    return null;
  }

  return {
    uid,
    libraryId,
    sourceIndex,
    direction: trade.side === "Short" ? -1 : 1,
    entryTime: Number.isFinite(Number(trade.entryTime)) ? Number(trade.entryTime) : null,
    pnlUsd: Number.isFinite(Number(trade.pnlUsd)) ? Number(trade.pnlUsd) : null,
    result: normalizeOutcomeLabel(trade.result),
    session: getSessionLabel(trade.entryTime),
    entryModel: trade.entrySource || null,
    label: trade.result === "Win" ? 1 : trade.result === "Loss" ? -1 : null,
    trade,
    vector: trade.neighborVector ?? buildTradeNeighborVector(trade)
  };
};

const buildLibraryPointSourceCandidate = (
  point: LibraryPointPayload,
  sourceIndex: number
): LibrarySourceCandidate | null => {
  const uid = String(point.uid ?? point.id ?? "").trim();
  const libraryId = String(point.libId ?? "").trim().toLowerCase();
  if (!uid || !libraryId) {
    return null;
  }

  const entryTimeRaw = Number(point.metaTime ?? point.entryTime ?? NaN);
  const entryTime = Number.isFinite(entryTimeRaw) ? entryTimeRaw : null;
  const pnlRaw = Number(point.metaPnl ?? point.pnl ?? NaN);
  const pnlUsd = Number.isFinite(pnlRaw) ? pnlRaw : null;
  const directionRaw = Number(point.dir ?? NaN);
  const labelRaw = Number(point.label ?? NaN);
  const normalizedOutcome =
    normalizeOutcomeLabel(point.metaOutcome ?? point.result) ??
    (Number.isFinite(labelRaw) ? (labelRaw >= 0 ? "Win" : "Loss") : null) ??
    (pnlUsd == null ? null : pnlUsd >= 0 ? "Win" : "Loss");

  return {
    uid,
    libraryId,
    sourceIndex,
    direction: Number.isFinite(directionRaw) ? directionRaw : null,
    entryTime,
    pnlUsd,
    result: normalizedOutcome,
    session:
      point.metaSession != null && String(point.metaSession).trim()
        ? String(point.metaSession)
        : entryTime == null
          ? null
          : getSessionLabel(entryTime),
    entryModel:
      point.metaModel != null && String(point.metaModel).trim()
        ? String(point.metaModel)
        : point.model != null && String(point.model).trim()
          ? String(point.model)
          : null,
    label: Number.isFinite(labelRaw) ? labelRaw : normalizedOutcome === "Win" ? 1 : normalizedOutcome === "Loss" ? -1 : null,
    trade: null,
    vector: toFiniteVector(point.v)
  };
};

const buildEntryNeighbor = (
  candidate: LibrarySourceCandidate,
  distance: number,
  weight: number,
  label: number | null
): BacktestEntryNeighbor => {
  const dir =
    Number.isFinite(Number(candidate.direction)) ? Number(candidate.direction) : null;
  const trade = candidate.trade;
  const fallbackSide =
    dir === -1 ? "Short" : dir === 1 ? "Long" : undefined;

  return {
    uid: candidate.uid,
    metaUid: candidate.uid,
    metaTime: candidate.entryTime,
    metaPnl: candidate.pnlUsd,
    metaOutcome: candidate.result,
    metaSession: candidate.session,
    dir,
    label,
    d: Number.isFinite(distance) ? distance : Number.MAX_SAFE_INTEGER,
    w: weight,
    t: {
      id: trade?.id ?? candidate.uid,
      uid: trade?.id ?? candidate.uid,
      tradeUid: trade?.id ?? candidate.uid,
      direction: dir ?? undefined,
      entryTime: candidate.entryTime ?? undefined,
      pnl: candidate.pnlUsd ?? undefined,
      result: candidate.result ?? undefined,
      session: candidate.session ?? undefined,
      entryModel: candidate.entryModel ?? undefined,
      chunkType: candidate.entryModel ?? undefined,
      model: candidate.entryModel ?? undefined,
      side: trade?.side ?? fallbackSide
    }
  };
};

const isSelfNeighborCandidate = (
  trade: HistoryItem,
  candidate: LibrarySourceCandidate
): boolean => {
  const tradeIds = new Set<string>();
  const candidateIds = new Set<string>();

  const addTradeId = (value: unknown) => {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      tradeIds.add(normalized);
    }
  };

  const addCandidateId = (value: unknown) => {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      candidateIds.add(normalized);
    }
  };

  addTradeId(trade.id);
  addTradeId((trade as any).tradeUid);
  addCandidateId(candidate.uid);
  addCandidateId(candidate.trade?.id);
  addCandidateId((candidate.trade as any)?.tradeUid);

  for (const id of tradeIds) {
    if (candidateIds.has(id)) {
      return true;
    }
  }

  return false;
};

const applyTradeAiEntrySnapshot = (
  trade: HistoryItem,
  snapshot: TradeAiEntrySnapshot | undefined,
  fallbackAiMode: BacktestTradeAiMode | null
): HistoryItem => {
  const preservedNeighbors = cloneEntryNeighbors(trade.entryNeighbors);
  const effectiveAiMode =
    snapshot?.aiMode ??
    (trade.aiMode === "knn" || trade.aiMode === "hdbscan" || trade.aiMode === "off"
      ? trade.aiMode
      : fallbackAiMode);

  if (!snapshot) {
    return effectiveAiMode == null
      ? {
          ...trade,
          closestClusterUid: trade.closestClusterUid ?? null,
          entryNeighbors: preservedNeighbors,
          neighborVector: trade.neighborVector ?? buildTradeNeighborVector(trade)
        }
      : {
          ...trade,
          aiMode: effectiveAiMode,
          closestClusterUid: trade.closestClusterUid ?? null,
          entryNeighbors: preservedNeighbors,
          neighborVector: trade.neighborVector ?? buildTradeNeighborVector(trade)
        };
  }

  const entryNeighbors = cloneEntryNeighbors(snapshot.entryNeighbors);

  return {
    ...trade,
    entryConfidence: snapshot.entryConfidence,
    confidence: snapshot.confidence,
    entryMargin: snapshot.entryMargin,
    margin: snapshot.margin,
    aiMode: snapshot.aiMode,
    closestClusterUid: snapshot.closestClusterUid,
    entryNeighbors,
    neighborVector: trade.neighborVector ?? buildTradeNeighborVector(trade)
  };
};

const toTradeTimestampMs = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric > 1_000_000_000_000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
};

const formatTradeTimeLabel = (timestampMs: number): string => {
  return new Date(timestampMs).toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
};

const resolveTradeTimeLabel = (label: unknown, timestamp: unknown): string => {
  const normalizedLabel =
    typeof label === "string"
      ? label.trim()
      : label == null
        ? ""
        : String(label).trim();

  if (normalizedLabel) {
    return normalizedLabel;
  }

  const timestampMs = toTradeTimestampMs(timestamp);
  return timestampMs == null ? "" : formatTradeTimeLabel(timestampMs);
};

const normalizeTrade = (value: unknown): HistoryItem | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();

  if (!id) {
    return null;
  }

  const entryTime = toNumeric(row.entryTime);
  const exitTime = toNumeric(row.exitTime);
  const entryAt = resolveTradeTimeLabel(row.entryAt, entryTime);
  const exitAt = resolveTradeTimeLabel(row.exitAt, exitTime);

  return {
    id,
    symbol: String(row.symbol ?? ""),
    side: row.side === "Short" ? "Short" : "Long",
    result: row.result === "Loss" ? "Loss" : "Win",
    entrySource: String(row.entrySource ?? "Settings"),
    exitReason: String(row.exitReason ?? ""),
    pnlPct: toNumeric(row.pnlPct),
    pnlUsd: toNumeric(row.pnlUsd),
    time: resolveTradeTimeLabel(row.time, exitTime) || exitAt,
    entryAt,
    exitAt,
    entryTime,
    exitTime,
    entryPrice: Math.max(0.000001, toNumeric(row.entryPrice)),
    targetPrice: Math.max(0.000001, toNumeric(row.targetPrice)),
    stopPrice: Math.max(0.000001, toNumeric(row.stopPrice)),
    outcomePrice: Math.max(0.000001, toNumeric(row.outcomePrice)),
    units: Math.max(0.000001, Math.abs(toNumeric(row.units, 1)) || 1),
    entryConfidence:
      row.entryConfidence == null ? null : toNumeric(row.entryConfidence),
    confidence:
      row.confidence == null
        ? row.entryConfidence == null
          ? null
          : toNumeric(row.entryConfidence)
        : toNumeric(row.confidence),
    entryMargin:
      row.entryMargin == null
        ? row.entryConfidence == null
          ? row.confidence == null
            ? null
            : toNumeric(row.confidence)
          : toNumeric(row.entryConfidence)
        : toNumeric(row.entryMargin),
    margin:
      row.margin == null
        ? row.entryMargin == null
          ? row.entryConfidence == null
            ? row.confidence == null
              ? null
              : toNumeric(row.confidence)
            : toNumeric(row.entryConfidence)
          : toNumeric(row.entryMargin)
        : toNumeric(row.margin),
    aiConfidence: row.aiConfidence == null ? null : toNumeric(row.aiConfidence),
    aiMode: normalizeTradeAiMode(row.aiMode),
    closestClusterUid:
      row.closestClusterUid == null ? null : String(row.closestClusterUid),
    entryNeighbors: cloneEntryNeighbors(row.entryNeighbors),
    neighborVector: toFiniteVector(row.neighborVector ?? row.v)
  };
};

const normalizeTrades = (value: unknown): HistoryItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: HistoryItem[] = [];

  for (const item of value) {
    const normalized = normalizeTrade(item);
    if (normalized) {
      rows.push(normalized);
    }
  }

  return rows;
};

const normalizeLibraryPoints = (value: unknown): LibraryPointPayload[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const rows: LibraryPointPayload[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const row = item as Record<string, unknown>;
    const uid = String(row.uid ?? row.id ?? "").trim();
    const libId = String(row.libId ?? "").trim().toLowerCase();
    if (!uid || !libId) {
      continue;
    }

    rows.push({
      id: row.id != null ? String(row.id) : undefined,
      uid,
      libId,
      model: row.model != null ? String(row.model) : null,
      metaModel: row.metaModel != null ? String(row.metaModel) : null,
      entryTime: row.entryTime == null ? null : Number(row.entryTime),
      metaTime: row.metaTime == null ? null : Number(row.metaTime),
      pnl: row.pnl == null ? null : Number(row.pnl),
      metaPnl: row.metaPnl == null ? null : Number(row.metaPnl),
      result: row.result != null ? String(row.result) : null,
      metaOutcome: row.metaOutcome != null ? String(row.metaOutcome) : null,
      metaSession: row.metaSession != null ? String(row.metaSession) : null,
      dir: row.dir == null ? null : Number(row.dir),
      label: row.label == null ? null : Number(row.label),
      v: toFiniteVector(row.v)
    });
  }

  return rows;
};

const normalizeFilterSettings = (value: unknown): BacktestFilterSettings => {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const normalizeValidationMode = (
    mode: unknown
  ): BacktestFilterSettings["validationMode"] => {
    const normalized = String(mode ?? "").trim().toLowerCase();
    if (normalized === "split" || normalized === "synthetic") {
      return normalized;
    }
    return "off";
  };

  return {
    statsDateStart: String(row.statsDateStart ?? ""),
    statsDateEnd: String(row.statsDateEnd ?? ""),
    enabledBacktestWeekdays: Array.isArray(row.enabledBacktestWeekdays)
      ? row.enabledBacktestWeekdays.map((entry) => String(entry))
      : [],
    enabledBacktestSessions: Array.isArray(row.enabledBacktestSessions)
      ? row.enabledBacktestSessions.map((entry) => String(entry))
      : [],
    enabledBacktestMonths: Array.isArray(row.enabledBacktestMonths)
      ? row.enabledBacktestMonths.map((entry) => Math.trunc(toNumeric(entry))).filter((entry) => Number.isFinite(entry))
      : [],
    enabledBacktestHours: Array.isArray(row.enabledBacktestHours)
      ? row.enabledBacktestHours.map((entry) => Math.trunc(toNumeric(entry))).filter((entry) => Number.isFinite(entry))
      : [],
    aiMode: row.aiMode === "knn" || row.aiMode === "hdbscan" ? row.aiMode : "off",
    antiCheatEnabled: row.antiCheatEnabled === true,
    validationMode: normalizeValidationMode(row.validationMode),
    selectedAiLibraries: Array.isArray(row.selectedAiLibraries)
      ? row.selectedAiLibraries.map((entry) => String(entry))
      : [],
    selectedAiLibrarySettings:
      row.selectedAiLibrarySettings &&
      typeof row.selectedAiLibrarySettings === "object" &&
      !Array.isArray(row.selectedAiLibrarySettings)
        ? (row.selectedAiLibrarySettings as AiLibrarySettings)
        : {},
    distanceMetric: normalizeDistanceMetric(row.distanceMetric),
    knnNeighborSpace: normalizeKnnNeighborSpace(row.knnNeighborSpace),
    kEntry: clamp(Math.floor(toNumeric(row.kEntry, 12)), 1, 512),
    knnVoteMode: normalizeKnnVoteMode(row.knnVoteMode),
    selectedAiDomains: Array.isArray(row.selectedAiDomains)
      ? row.selectedAiDomains.map((entry) => String(entry))
      : [],
    remapOppositeOutcomes: row.remapOppositeOutcomes === false ? false : true
  };
};

const normalizeAiLibraryDefaultsById = (
  value: unknown
): Record<string, Record<string, AiLibrarySettingValue>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const out: Record<string, Record<string, AiLibrarySettingValue>> = {};

  for (const [key, rawDefaults] of Object.entries(value as Record<string, unknown>)) {
    if (!rawDefaults || typeof rawDefaults !== "object" || Array.isArray(rawDefaults)) {
      continue;
    }

    const next: Record<string, AiLibrarySettingValue> = {};
    for (const [settingKey, settingValue] of Object.entries(rawDefaults)) {
      if (
        typeof settingValue === "boolean" ||
        typeof settingValue === "number" ||
        typeof settingValue === "string"
      ) {
        next[settingKey] = settingValue;
      }
    }

    out[key] = next;
  }

  return out;
};

const computeAntiCheatBacktestContext = (params: {
  panelSourceTrades: HistoryItem[];
  panelLibraryPoints: LibraryPointPayload[];
  panelBacktestFilterSettings: BacktestFilterSettings;
  aiLibraryDefaultsById: Record<string, Record<string, AiLibrarySettingValue>>;
}) => {
  const {
    panelSourceTrades,
    panelLibraryPoints,
    panelBacktestFilterSettings,
    aiLibraryDefaultsById
  } = params;
  const startMs = getUtcDayStartMs(panelBacktestFilterSettings.statsDateStart);
  const endExclusiveMs = getUtcDayEndExclusiveMs(panelBacktestFilterSettings.statsDateEnd);
  const dateFilteredTrades = panelSourceTrades.filter((trade) => {
    const tradeMs = Number(trade.entryTime) * 1000;

    if (!Number.isFinite(tradeMs)) {
      return false;
    }

    if (startMs !== null && tradeMs < startMs) {
      return false;
    }

    if (endExclusiveMs !== null && tradeMs >= endExclusiveMs) {
      return false;
    }

    return true;
  });

  const timeFilteredBase = dateFilteredTrades.filter((trade) => {
    const weekday = getWeekdayLabel(getTradeDayKey(trade.exitTime));
    const session = getSessionLabel(trade.entryTime);
    const monthIndex = getTradeMonthIndex(trade.exitTime);
    const entryHour = getTradeHour(trade.entryTime);

    return (
      panelBacktestFilterSettings.enabledBacktestWeekdays.includes(weekday) &&
      panelBacktestFilterSettings.enabledBacktestSessions.includes(session) &&
      panelBacktestFilterSettings.enabledBacktestMonths.includes(monthIndex) &&
      panelBacktestFilterSettings.enabledBacktestHours.includes(entryHour)
    );
  });

  const chronologicalTrades = [...timeFilteredBase].sort(
    (left, right) => Number(left.entryTime) - Number(right.entryTime)
  );
  const confidenceById = new Map<string, number>();
  const aiEntrySnapshotById = new Map<string, TradeAiEntrySnapshot>();
  const effectiveValidationMode = panelBacktestFilterSettings.antiCheatEnabled
    ? panelBacktestFilterSettings.validationMode
    : "off";
  const usesSplitValidation =
    effectiveValidationMode === "split";
  const resolveSplitTimestampMs = (): number | null => {
    if (startMs !== null && endExclusiveMs !== null && endExclusiveMs > startMs) {
      return startMs + Math.floor((endExclusiveMs - startMs) * 0.5);
    }
    if (chronologicalTrades.length === 0) {
      return null;
    }
    const mid = chronologicalTrades[Math.floor(chronologicalTrades.length * 0.5)];
    const entryMs = Number(mid?.entryTime) * 1000;
    return Number.isFinite(entryMs) && entryMs > 0 ? entryMs : null;
  };
  const splitTimestampMs = usesSplitValidation ? resolveSplitTimestampMs() : null;
  let splitTrainingTrades = usesSplitValidation
    ? chronologicalTrades.filter((trade) => Number(trade.entryTime) * 1000 < (splitTimestampMs ?? 0))
    : chronologicalTrades;
  let splitEvaluationTrades = usesSplitValidation
    ? chronologicalTrades.filter((trade) => Number(trade.entryTime) * 1000 >= (splitTimestampMs ?? 0))
    : chronologicalTrades;
  if (
    usesSplitValidation &&
    splitTimestampMs !== null &&
    (splitTrainingTrades.length === 0 || splitEvaluationTrades.length === 0)
  ) {
    const fallbackIndex = Math.floor(chronologicalTrades.length * 0.5);
    splitTrainingTrades = chronologicalTrades.slice(0, fallbackIndex);
    splitEvaluationTrades = chronologicalTrades.slice(fallbackIndex);
  }

  if (
    panelBacktestFilterSettings.aiMode === "off" ||
    chronologicalTrades.length === 0
  ) {
    return {
      dateFilteredTrades,
      libraryCandidateTrades: splitTrainingTrades,
      timeFilteredTrades: splitEvaluationTrades,
      confidenceById,
      aiEntrySnapshotById
    };
  }

  const activeAiMode = panelBacktestFilterSettings.aiMode;
  const explicitActiveLibraryIds = panelBacktestFilterSettings.selectedAiLibraries
    .map((libraryId) => String(libraryId ?? "").trim().toLowerCase())
    .filter((libraryId) => libraryId.length > 0);
  const activeLibraryIds =
    explicitActiveLibraryIds.length > 0
      ? explicitActiveLibraryIds
      : ["base"];
  const timeFilteredTrades = splitEvaluationTrades;
  const libraryPointsById = panelLibraryPoints.reduce<Map<string, LibrarySourceCandidate[]>>(
    (accumulator, point) => {
      const candidate = buildLibraryPointSourceCandidate(point, 0);
      if (!candidate) {
        return accumulator;
      }
      const key = candidate.libraryId;
      const list = accumulator.get(key) ?? [];
      list.push({
        ...candidate,
        sourceIndex: list.length
      });
      accumulator.set(key, list);
      return accumulator;
    },
    new Map<string, LibrarySourceCandidate[]>()
  );
  const hasCanonicalLibraryCandidates = activeLibraryIds.some((libraryId) => {
    const normalizedLibraryId = String(libraryId ?? "").trim().toLowerCase();
    if (!normalizedLibraryId || normalizedLibraryId === "core") {
      return false;
    }

    return (libraryPointsById.get(normalizedLibraryId)?.length ?? 0) > 0;
  });

  const getLibrarySettings = (libraryId: string) => {
    const defaults = aiLibraryDefaultsById[libraryId] ?? {};
    return {
      ...defaults,
      ...(panelBacktestFilterSettings.selectedAiLibrarySettings[libraryId] ?? {})
    } as Record<string, AiLibrarySettingValue>;
  };

  const getLibraryWeight = (libraryId: string) => {
    const raw = Number(getLibrarySettings(libraryId).weight ?? 100);
    const pct = raw <= 10 ? raw * 100 : raw;
    return clamp(pct, 0, 5000) / 100;
  };

  const getLibraryStride = (libraryId: string) => {
    return clamp(
      Math.floor(Number(getLibrarySettings(libraryId).stride ?? 0) || 0),
      0,
      5000
    );
  };

  const getLibraryMaxSamples = (libraryId: string, fallback = 96) => {
    return clamp(
      Math.floor(Number(getLibrarySettings(libraryId).maxSamples ?? fallback) || fallback),
      0,
      100000
    );
  };

  const getLibraryCount = (libraryId: string, fallback = 24) => {
    return clamp(
      Math.floor(Number(getLibrarySettings(libraryId).count ?? fallback) || fallback),
      0,
      100000
    );
  };
  const entryNeighborCap = clamp(
    Math.floor(Number(panelBacktestFilterSettings.kEntry) || 12),
    1,
    512
  );

  const getTradeRiskReward = (trade: HistoryItem) => {
    const riskDistance = Math.max(0.000001, Math.abs(trade.entryPrice - trade.stopPrice));
    const rewardDistance = Math.abs(trade.targetPrice - trade.entryPrice);
    return rewardDistance / riskDistance;
  };

  const getSyntheticWinProb = (trade: HistoryItem) => {
    const session = getSessionLabel(trade.entryTime);
    const entryHour = getTradeHour(trade.entryTime);
    const rr = getTradeRiskReward(trade);
    const seed = hashSeedFromText(
      `${trade.symbol}|${trade.entrySource}|${trade.side}|${trade.entryTime}`
    );
    let score = 0.5 + (((seed % 1000) / 999) - 0.5) * 0.12;

    if (trade.side === "Long") {
      score += 0.015;
    }

    if (session === "London") {
      score += 0.035;
    } else if (session === "New York") {
      score += 0.025;
    } else if (session === "Tokyo") {
      score -= 0.01;
    }

    score += Math.sin((entryHour / 24) * Math.PI * 2) * 0.035;
    score += clamp((rr - 1.1) * 0.045, -0.08, 0.08);

    return clamp(score, 0.08, 0.92);
  };

  const pickLibrarySource = (
    libraryId: string,
    pool: HistoryItem[],
    currentTrade: HistoryItem
  ) => {
    const settings = getLibrarySettings(libraryId);
    const normalizedId = libraryId.toLowerCase();
    const canonicalPoints = libraryPointsById.get(normalizedId);
    if (canonicalPoints && canonicalPoints.length > 0) {
      return canonicalPoints.map((candidate, sourceIndex) => ({
        candidate: {
          ...candidate,
          sourceIndex
        },
        libraryId,
        sourceIndex
      }));
    }

    if (normalizedId !== "core") {
      return [];
    }

    const maxSamples = getLibraryMaxSamples(libraryId, 96);
    const stride = getLibraryStride(libraryId);
    const source = collectCappedItems(pool, {
      cap: maxSamples,
      stride
    });

    const baselineWinRate = getOutcomeWinRatePercent(
      source,
      (candidate) => candidate.result === "Win"
    );
    const targetWinRate = resolveAiLibraryTargetWinRate(
      settings,
      baselineWinRate,
      source.length
    );

    const balanced = rebalanceItemsToTargetWinRate(
      source,
      maxSamples,
      targetWinRate,
      (candidate) => candidate.result === "Win",
      false
    );

    return balanced
      .map((trade, sourceIndex) => ({
        candidate: buildTradeSourceCandidate(libraryId, trade, sourceIndex),
        libraryId,
        sourceIndex
      }))
      .filter(
        (
          entry
        ): entry is {
          candidate: LibrarySourceCandidate;
          libraryId: string;
          sourceIndex: number;
        } => entry.candidate !== null
      );
  };

  const getCandidateOutcomeScore = (candidate: LibrarySourceCandidate) => {
    if (candidate.result === "Win") {
      return 1;
    }
    if (candidate.result === "Loss") {
      return 0;
    }
    if (candidate.label === 1) {
      return 1;
    }
    if (candidate.label === -1) {
      return 0;
    }
    if (candidate.pnlUsd != null) {
      return candidate.pnlUsd >= 0 ? 1 : 0;
    }
    return 0;
  };

  const resolveCandidateOutcomeScore = (candidate: LibrarySourceCandidate) => {
    return effectiveValidationMode === "synthetic" && candidate.trade
      ? getSyntheticWinProb(candidate.trade)
      : getCandidateOutcomeScore(candidate);
  };

  const resolveEffectiveOutcomeScore = (
    candidate: LibrarySourceCandidate,
    trade: HistoryItem,
    rawOutcomeScore: number
  ) => {
    const remapOppositeOutcomes =
      panelBacktestFilterSettings.remapOppositeOutcomes !== false;
    const selectedDomains = new Set(panelBacktestFilterSettings.selectedAiDomains);

    if (!remapOppositeOutcomes || selectedDomains.has("Direction")) {
      return clamp(rawOutcomeScore, 0, 1);
    }

    if (candidate.direction == null || candidate.direction === getTradeDirection(trade)) {
      return clamp(rawOutcomeScore, 0, 1);
    }

    return clamp(1 - rawOutcomeScore, 0, 1);
  };

  const resolveEffectiveOutcomeLabel = (
    candidate: LibrarySourceCandidate,
    trade: HistoryItem,
    outcomeScore: number
  ) => {
    const selectedDomains = new Set(panelBacktestFilterSettings.selectedAiDomains);
    const remapOppositeOutcomes =
      panelBacktestFilterSettings.remapOppositeOutcomes !== false;
    const baseLabel =
      candidate.label == null ? (outcomeScore >= 0.5 ? 1 : -1) : candidate.label;

    if (!remapOppositeOutcomes || selectedDomains.has("Direction")) {
      return baseLabel;
    }

    if (candidate.direction == null || candidate.direction === getTradeDirection(trade)) {
      return baseLabel;
    }

    return -baseLabel;
  };

  const computeNeighborConfidence = (neighbors: LibraryNeighborAggregateEntry[]) => {
    let wins = 0;
    let losses = 0;

    for (const neighbor of neighbors) {
      const voteWeight =
        Number.isFinite(neighbor.voteWeight) && neighbor.voteWeight > 0
          ? neighbor.voteWeight
          : 1;
      const outcomeScore = clamp(neighbor.outcomeScore, 0, 1);
      wins += voteWeight * outcomeScore;
      losses += voteWeight * (1 - outcomeScore);
    }

    if (wins <= 0 && losses <= 0) {
      return null;
    }

    return clamp(wins / (wins + losses + AI_EPS), 0, 1);
  };

  const hydrateTradesWithSnapshots = (trades: HistoryItem[]) => {
    return trades.map((trade) =>
      applyTradeAiEntrySnapshot(
        trade,
        aiEntrySnapshotById.get(trade.id),
        activeAiMode
      )
    );
  };

  const staticLibrarySourceById = new Map<
    string,
    Array<{ candidate: LibrarySourceCandidate; sourceIndex: number; libraryId: string }>
  >();
  const staticLibraryVectorSpaceById = new Map<string, StaticCandidateVectorSpace>();
  const selectedAiDomains = new Set(panelBacktestFilterSettings.selectedAiDomains);

  for (const libraryId of activeLibraryIds) {
    const normalizedLibraryId = String(libraryId ?? "").trim().toLowerCase();
    if (!normalizedLibraryId || normalizedLibraryId === "core") {
      continue;
    }

    const canonicalPoints = libraryPointsById.get(normalizedLibraryId);
    if (!canonicalPoints || canonicalPoints.length === 0) {
      continue;
    }

    const source = canonicalPoints.map((candidate, sourceIndex) => ({
      candidate: {
        ...candidate,
        sourceIndex
      },
      libraryId,
      sourceIndex
    }));

    staticLibrarySourceById.set(libraryId, source);
    staticLibraryVectorSpaceById.set(
      libraryId,
      buildStaticCandidateVectorSpace(source, panelBacktestFilterSettings)
    );
  }

  for (let index = 0; index < chronologicalTrades.length; index += 1) {
    const trade = chronologicalTrades[index]!;
    const tradeQueryVector = trade.neighborVector ?? buildTradeNeighborVector(trade);
    const preservedNeighbors = cloneEntryNeighbors(trade.entryNeighbors);
    const preservedClosestClusterUid =
      trade.closestClusterUid == null ? null : String(trade.closestClusterUid);
    const preservedConfidenceRaw =
      trade.entryConfidence ?? trade.confidence ?? trade.entryMargin ?? trade.margin ?? null;
    const preservedConfidence = Number(preservedConfidenceRaw);
    const basePool =
      effectiveValidationMode === "split"
        ? splitTrainingTrades
        : effectiveValidationMode === "synthetic"
          ? chronologicalTrades.filter((_, candidateIndex) => candidateIndex !== index)
          : panelBacktestFilterSettings.antiCheatEnabled
            ? chronologicalTrades.slice(0, index)
            : chronologicalTrades;

    if (basePool.length === 0 && !hasCanonicalLibraryCandidates) {
      const confidence =
        Number.isFinite(preservedConfidence)
          ? clamp(preservedConfidence, 0.01, 0.99)
          : getSyntheticWinProb(trade);
      confidenceById.set(trade.id, confidence);
      aiEntrySnapshotById.set(trade.id, {
        entryConfidence: confidence,
        confidence,
        entryMargin: confidence,
        margin: confidence,
        aiMode: activeAiMode,
        closestClusterUid: preservedClosestClusterUid,
        entryNeighbors: preservedNeighbors
      });
      continue;
    }

    const baselineWinRate =
      basePool.length > 0
        ? basePool.reduce((sum, candidate) => sum + (candidate.result === "Win" ? 1 : 0), 0) /
          basePool.length
        : 0.5;
    const queryMeta = getTradeQueryMeta(trade.entryTime);
    const neighborEntries: LibraryNeighborAggregateEntry[] = [];

    for (const libraryId of activeLibraryIds) {
      const libraryWeight = getLibraryWeight(libraryId);

      if (libraryWeight <= 0) {
        continue;
      }

      const staticSource = staticLibrarySourceById.get(libraryId);
      const staticVectorSpace = staticLibraryVectorSpaceById.get(libraryId);
      const source = staticSource ?? pickLibrarySource(libraryId, basePool, trade);
      if (source.length === 0) {
        continue;
      }

      const preparedVectorSpace =
        staticVectorSpace && staticSource
          ? {
              candidates: staticVectorSpace.candidates,
              queryVector: staticVectorSpace.projectQuery(tradeQueryVector),
              variance: staticVectorSpace.variance
            }
          : prepareCandidateVectorSpace(
              trade,
              source,
              panelBacktestFilterSettings
            );

      if (!preparedVectorSpace.queryVector) {
        continue;
      }

      for (let candidateIndex = 0; candidateIndex < source.length; candidateIndex += 1) {
        const candidateEntry = source[candidateIndex]!;
        const { candidate } = candidateEntry;
        if (isSelfNeighborCandidate(trade, candidate)) {
          continue;
        }
        if (!candidatePassesAiDomains(candidate, trade, selectedAiDomains, queryMeta)) {
          continue;
        }
        const candidateVector = preparedVectorSpace.candidates[candidateIndex] ?? null;
        if (!candidateVector) {
          continue;
        }
        const distance = getVectorDistance(
          preparedVectorSpace.queryVector,
          candidateVector,
          panelBacktestFilterSettings.distanceMetric,
          preparedVectorSpace.variance
        );
        if (!Number.isFinite(distance)) {
          continue;
        }

        const rawOutcomeScore = resolveCandidateOutcomeScore(candidate);
        const outcomeScore = resolveEffectiveOutcomeScore(candidate, trade, rawOutcomeScore);
        const effectiveLabel = resolveEffectiveOutcomeLabel(candidate, trade, outcomeScore);
        const voteWeight = computeNeighborVoteWeight(libraryWeight);
        if (!(voteWeight > 0)) {
          continue;
        }

        neighborEntries.push({
          candidate,
          distance,
          voteWeight,
          effectiveLabel,
          outcomeScore
        });
      }
    }

    if (neighborEntries.length === 0) {
      const confidence =
        Number.isFinite(preservedConfidence)
          ? clamp(preservedConfidence, 0.01, 0.99)
          : clamp(0.5 + (baselineWinRate - 0.5) * 0.2, 0.18, 0.82);
      confidenceById.set(trade.id, confidence);
      aiEntrySnapshotById.set(trade.id, {
        entryConfidence: confidence,
        confidence,
        entryMargin: confidence,
        margin: confidence,
        aiMode: activeAiMode,
        closestClusterUid: preservedClosestClusterUid,
        entryNeighbors: preservedNeighbors
      });
      continue;
    }

    const rankedNeighborEntries = [...neighborEntries]
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          right.voteWeight - left.voteWeight ||
          Number(right.candidate.entryTime ?? 0) - Number(left.candidate.entryTime ?? 0) ||
          left.candidate.uid.localeCompare(right.candidate.uid)
      )
      .slice(0, entryNeighborCap);
    const confidence =
      computeNeighborConfidence(rankedNeighborEntries) ??
      clamp(0.5 + (baselineWinRate - 0.5) * 0.2, 0.18, 0.82);
    const rankedNeighbors = rankedNeighborEntries.map((entry) =>
      buildEntryNeighbor(
        entry.candidate,
        entry.distance,
        entry.voteWeight,
        entry.effectiveLabel
      )
    );

    confidenceById.set(trade.id, confidence);
    aiEntrySnapshotById.set(trade.id, {
      entryConfidence: confidence,
      confidence,
      entryMargin: confidence,
      margin: confidence,
      aiMode: activeAiMode,
      closestClusterUid:
        rankedNeighbors.length > 0
          ? String(rankedNeighbors[0]?.metaUid ?? rankedNeighbors[0]?.uid ?? "").trim() || null
          : null,
      entryNeighbors: rankedNeighbors
    });
  }

  return {
    dateFilteredTrades,
    libraryCandidateTrades: splitTrainingTrades,
    timeFilteredTrades: hydrateTradesWithSnapshots(timeFilteredTrades),
    confidenceById,
    aiEntrySnapshotById
  };
};

const filterHistoryRows = (params: {
  sourceTrades: HistoryItem[];
  settings: BacktestFilterSettings;
  confidenceById: Map<string, number>;
  aiEntrySnapshotById: Map<string, TradeAiEntrySnapshot>;
  confidenceGateDisabled: boolean;
  effectiveConfidenceThreshold: number;
}) => {
  const {
    sourceTrades,
    settings,
    confidenceById,
    aiEntrySnapshotById,
    confidenceGateDisabled,
    effectiveConfidenceThreshold
  } = params;

  const startMs = getUtcDayStartMs(settings.statsDateStart);
  const endExclusiveMs = getUtcDayEndExclusiveMs(settings.statsDateEnd);

  return sourceTrades
    .filter((trade) => {
      const tradeMs = Number(trade.entryTime) * 1000;

      if (!Number.isFinite(tradeMs)) {
        return false;
      }

      if (startMs !== null && tradeMs < startMs) {
        return false;
      }

      if (endExclusiveMs !== null && tradeMs >= endExclusiveMs) {
        return false;
      }

      const weekday = getWeekdayLabel(getTradeDayKey(trade.exitTime));
      const session = getSessionLabel(trade.entryTime);
      const monthIndex = getTradeMonthIndex(trade.exitTime);
      const entryHour = getTradeHour(trade.entryTime);

      if (
        !settings.enabledBacktestWeekdays.includes(weekday) ||
        !settings.enabledBacktestSessions.includes(session) ||
        !settings.enabledBacktestMonths.includes(monthIndex) ||
        !settings.enabledBacktestHours.includes(entryHour)
      ) {
        return false;
      }

      if (confidenceGateDisabled) {
        return true;
      }

      const confidence = (confidenceById.get(trade.id) ?? getTradeConfidenceScore(trade)) * 100;
      return confidence >= effectiveConfidenceThreshold;
    })
    .map((trade) =>
      applyTradeAiEntrySnapshot(
        trade,
        aiEntrySnapshotById.get(trade.id),
        settings.aiMode === "off" ? null : settings.aiMode
      )
    )
    .sort((a, b) => Number(b.exitTime) - Number(a.exitTime) || b.id.localeCompare(a.id));
};

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const body =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : null;

  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const panelSourceTrades = normalizeTrades(body.panelSourceTrades);
  const panelLibraryPoints = normalizeLibraryPoints(body.panelLibraryPoints);
  const panelBacktestFilterSettings = normalizeFilterSettings(body.panelBacktestFilterSettings);
  const panelConfidenceGateDisabled = body.panelConfidenceGateDisabled === true;
  const panelEffectiveConfidenceThreshold = toNumeric(body.panelEffectiveConfidenceThreshold);
  const activePanelSourceTrades =
    body.activePanelSourceTrades === undefined
      ? panelSourceTrades
      : normalizeTrades(body.activePanelSourceTrades);
  const activePanelBacktestFilterSettings =
    body.activePanelBacktestFilterSettings === undefined
      ? panelBacktestFilterSettings
      : normalizeFilterSettings(body.activePanelBacktestFilterSettings);
  const activePanelConfidenceGateDisabled =
    body.activePanelConfidenceGateDisabled === undefined
      ? panelConfidenceGateDisabled
      : body.activePanelConfidenceGateDisabled === true;
  const activePanelEffectiveConfidenceThreshold =
    body.activePanelEffectiveConfidenceThreshold === undefined
      ? panelEffectiveConfidenceThreshold
      : toNumeric(body.activePanelEffectiveConfidenceThreshold);
  const aiLibraryDefaultsById = normalizeAiLibraryDefaultsById(body.aiLibraryDefaultsById);

  try {
    const antiCheatBacktestContext = computeAntiCheatBacktestContext({
      panelSourceTrades,
      panelLibraryPoints,
      panelBacktestFilterSettings,
      aiLibraryDefaultsById
    });

    const chartPanelHistoryRows = filterHistoryRows({
      sourceTrades: antiCheatBacktestContext.timeFilteredTrades,
      settings: panelBacktestFilterSettings,
      confidenceById: antiCheatBacktestContext.confidenceById,
      aiEntrySnapshotById: antiCheatBacktestContext.aiEntrySnapshotById,
      confidenceGateDisabled: panelConfidenceGateDisabled,
      effectiveConfidenceThreshold: panelEffectiveConfidenceThreshold
    });

    const activePanelHistoryRows = filterHistoryRows({
      sourceTrades: activePanelSourceTrades,
      settings: activePanelBacktestFilterSettings,
      confidenceById: antiCheatBacktestContext.confidenceById,
      aiEntrySnapshotById: antiCheatBacktestContext.aiEntrySnapshotById,
      confidenceGateDisabled: activePanelConfidenceGateDisabled,
      effectiveConfidenceThreshold: activePanelEffectiveConfidenceThreshold
    });

    const payload: PanelAnalyticsResponseBody = {
      dateFilteredTrades: antiCheatBacktestContext.dateFilteredTrades,
      libraryCandidateTrades: antiCheatBacktestContext.libraryCandidateTrades,
      timeFilteredTrades: antiCheatBacktestContext.timeFilteredTrades,
      confidenceByIdEntries: Array.from(antiCheatBacktestContext.confidenceById.entries()),
      chartPanelHistoryRows,
      activePanelHistoryRows
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("[AIZip][PanelAnalyticsRouteError]", {
      panelSourceTrades: panelSourceTrades.length,
      panelLibraryPoints: panelLibraryPoints.length,
      selectedAiLibraries: panelBacktestFilterSettings.selectedAiLibraries,
      aiMode: panelBacktestFilterSettings.aiMode,
      knnNeighborSpace: panelBacktestFilterSettings.knnNeighborSpace,
      kEntry: panelBacktestFilterSettings.kEntry,
      error
    });

    return NextResponse.json(
      {
        error: "Panel analytics server compute failed."
      },
      { status: 500 }
    );
  }
}
