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

type HistoryItem = {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  result: "Win" | "Loss";
  entrySource: string;
  pnlPct: number;
  pnlUsd: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  outcomePrice: number;
  units: number;
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
};

type LibraryNeighborAggregateEntry = {
  candidate: LibrarySourceCandidate;
  score: number;
  bestSimilarity: number;
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
  validationMode: "off" | "split" | "online" | "synthetic";
  selectedAiLibraries: string[];
  selectedAiLibrarySettings: AiLibrarySettings;
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
  if (!normalizedLibraryId || normalizedLibraryId === "trades") {
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
    trade
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
    trade: null
  };
};

const buildEntryNeighbor = (
  candidate: LibrarySourceCandidate,
  similarity: number,
  weight: number
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
    label: candidate.label,
    d: similarity > 0 ? 1 / similarity : Number.MAX_SAFE_INTEGER,
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
          entryNeighbors: preservedNeighbors
        }
      : {
          ...trade,
          aiMode: effectiveAiMode,
          entryNeighbors: preservedNeighbors
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
    entryNeighbors
  };
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

  return {
    id,
    symbol: String(row.symbol ?? ""),
    side: row.side === "Short" ? "Short" : "Long",
    result: row.result === "Loss" ? "Loss" : "Win",
    entrySource: String(row.entrySource ?? "Settings"),
    pnlPct: toNumeric(row.pnlPct),
    pnlUsd: toNumeric(row.pnlUsd),
    entryTime: toNumeric(row.entryTime),
    exitTime: toNumeric(row.exitTime),
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
    entryNeighbors: cloneEntryNeighbors(row.entryNeighbors)
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
      label: row.label == null ? null : Number(row.label)
    });
  }

  return rows;
};

const normalizeFilterSettings = (value: unknown): BacktestFilterSettings => {
  const row =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

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
    validationMode:
      row.validationMode === "split" ||
      row.validationMode === "online" ||
      row.validationMode === "synthetic"
        ? row.validationMode
        : "off",
    selectedAiLibraries: Array.isArray(row.selectedAiLibraries)
      ? row.selectedAiLibraries.map((entry) => String(entry))
      : [],
    selectedAiLibrarySettings:
      row.selectedAiLibrarySettings &&
      typeof row.selectedAiLibrarySettings === "object" &&
      !Array.isArray(row.selectedAiLibrarySettings)
        ? (row.selectedAiLibrarySettings as AiLibrarySettings)
        : {}
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
  const usesSplitValidation =
    panelBacktestFilterSettings.antiCheatEnabled &&
    panelBacktestFilterSettings.validationMode === "split";
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
  const activeLibraryIds =
    panelBacktestFilterSettings.selectedAiLibraries.length > 0
      ? panelBacktestFilterSettings.selectedAiLibraries
      : [];
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

    const maxSamples = getLibraryMaxSamples(libraryId, 96);
    const stride = getLibraryStride(libraryId);
    let source: HistoryItem[] = [];

    if (normalizedId === "suppressed") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => trade.result === "Loss"
      });
    } else if (normalizedId === "recent") {
      const windowTrades = clamp(
        Math.floor(Number(settings.windowTrades ?? 150) || 150),
        0,
        5000
      );
      const startIndex = Math.max(0, pool.length - windowTrades);
      source =
        windowTrades > 0
          ? collectCappedItems(pool, {
              cap: maxSamples,
              stride,
              startIndex,
              endIndex: pool.length
            })
          : [];
    } else if (normalizedId === "tokyo") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => getSessionLabel(trade.entryTime) === "Tokyo"
      });
    } else if (normalizedId === "sydney") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => getSessionLabel(trade.entryTime) === "Sydney"
      });
    } else if (normalizedId === "london") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => getSessionLabel(trade.entryTime) === "London"
      });
    } else if (normalizedId === "newyork") {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => getSessionLabel(trade.entryTime) === "New York"
      });
    } else if (normalizedId === "terrific") {
      const count = getLibraryCount(libraryId, 96);
      const effectiveCap = Math.min(maxSamples, count);
      const capped = collectCappedItems(pool, {
        cap: effectiveCap
      });
      source = applyStrideToItems(
        [...capped].sort((left, right) => right.pnlUsd - left.pnlUsd),
        stride
      );
    } else if (normalizedId === "terrible") {
      const count = getLibraryCount(libraryId, 96);
      const effectiveCap = Math.min(maxSamples, count);
      const capped = collectCappedItems(pool, {
        cap: effectiveCap
      });
      source = applyStrideToItems(
        [...capped].sort((left, right) => left.pnlUsd - right.pnlUsd),
        stride
      );
    } else if ((settings.kind as string | undefined) === "model_sim") {
      const targetModel = String(settings.model ?? currentTrade.entrySource);
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride,
        predicate: (trade) => trade.entrySource === targetModel
      });
    } else {
      source = collectCappedItems(pool, {
        cap: maxSamples,
        stride
      });
    }

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
      normalizedId === "terrific" || normalizedId === "terrible"
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

  const getSimilarityWeight = (currentTrade: HistoryItem, candidate: LibrarySourceCandidate) => {
    let weight = 0.35;
    const currentDirection = currentTrade.side === "Short" ? -1 : 1;

    if (candidate.direction === currentDirection) {
      weight += 0.18;
    }

    if (candidate.entryModel && candidate.entryModel === currentTrade.entrySource) {
      weight += 0.24;
    }

    if (candidate.trade?.symbol === currentTrade.symbol) {
      weight += 0.1;
    }

    const candidateSession =
      candidate.session ??
      (candidate.entryTime == null ? null : getSessionLabel(candidate.entryTime));
    if (candidateSession === getSessionLabel(currentTrade.entryTime)) {
      weight += 0.12;
    }

    const candidateHour =
      candidate.entryTime == null ? null : getTradeHour(candidate.entryTime);
    const hourGap =
      candidateHour == null
        ? Number.POSITIVE_INFINITY
        : Math.abs(candidateHour - getTradeHour(currentTrade.entryTime));

    if (hourGap === 0) {
      weight += 0.08;
    } else if (hourGap <= 2) {
      weight += 0.04;
    }

    if (candidate.trade) {
      const rrGap = Math.abs(
        getTradeRiskReward(candidate.trade) - getTradeRiskReward(currentTrade)
      );
      weight *= 1 / (1 + rrGap * 0.65);
    }

    if (candidate.entryTime != null) {
      const timeGapHours = Math.abs(
        Number(currentTrade.entryTime) - Number(candidate.entryTime)
      ) / 3600;
      weight *= 1 / (1 + timeGapHours / 72);
    }

    return clamp(weight, 0.02, 2);
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

  for (let index = 0; index < chronologicalTrades.length; index += 1) {
    const trade = chronologicalTrades[index]!;
    const basePool =
      panelBacktestFilterSettings.validationMode === "split"
        ? splitTrainingTrades
        : chronologicalTrades.slice(0, index);

    if (basePool.length === 0) {
      const confidence = getSyntheticWinProb(trade);
      confidenceById.set(trade.id, confidence);
      aiEntrySnapshotById.set(trade.id, {
        entryConfidence: confidence,
        confidence,
        entryMargin: confidence,
        margin: confidence,
        aiMode: activeAiMode,
        closestClusterUid: null,
        entryNeighbors: []
      });
      continue;
    }

    const baselineWinRate =
      basePool.reduce((sum, candidate) => sum + (candidate.result === "Win" ? 1 : 0), 0) /
      basePool.length;
    let weightedWins = 0;
    let weightedTotal = 0;
    let similarityTotal = 0;
    let sampleCount = 0;
    const neighborAggregate = new Map<string, LibraryNeighborAggregateEntry>();

    for (const libraryId of activeLibraryIds) {
      const libraryWeight = getLibraryWeight(libraryId);

      if (libraryWeight <= 0) {
        continue;
      }

      const source = pickLibrarySource(libraryId, basePool, trade);

      for (const candidateEntry of source) {
        const { candidate, sourceIndex } = candidateEntry;
        const rawSimilarity = getSimilarityWeight(trade, candidate);
        const similarityWeight = rawSimilarity * libraryWeight;
        const outcome =
          panelBacktestFilterSettings.validationMode === "synthetic" && candidate.trade
            ? getSyntheticWinProb(candidate.trade)
            : getCandidateOutcomeScore(candidate);

        weightedWins += similarityWeight * outcome;
        weightedTotal += similarityWeight;
        similarityTotal += similarityWeight;
        sampleCount += 1;

        const neighborUid = candidate.uid;
        if (!neighborUid) {
          continue;
        }

        const existing = neighborAggregate.get(neighborUid);
        if (existing) {
          existing.score += similarityWeight;
          if (rawSimilarity > existing.bestSimilarity) {
            existing.bestSimilarity = rawSimilarity;
          }
        } else {
          neighborAggregate.set(neighborUid, {
            candidate,
            score: similarityWeight,
            bestSimilarity: rawSimilarity
          });
        }
      }
    }

    if (sampleCount === 0 || weightedTotal <= 0) {
      const confidence = clamp(0.5 + (baselineWinRate - 0.5) * 0.2, 0.18, 0.82);
      confidenceById.set(trade.id, confidence);
      aiEntrySnapshotById.set(trade.id, {
        entryConfidence: confidence,
        confidence,
        entryMargin: confidence,
        margin: confidence,
        aiMode: activeAiMode,
        closestClusterUid: null,
        entryNeighbors: []
      });
      continue;
    }

    const weightedWinRate = weightedWins / weightedTotal;
    const labelVariance = weightedWinRate * (1 - weightedWinRate) * 4;
    const matchStrength = clamp(similarityTotal / Math.max(1, sampleCount), 0, 1);
    const coverage = clamp(sampleCount / 12, 0, 1);
    const shrink =
      coverage * (0.2 + matchStrength * 0.8) * (0.35 + labelVariance * 0.65);
    const confidence =
      baselineWinRate + (weightedWinRate - baselineWinRate) * shrink;
    const normalizedConfidence = clamp(confidence, 0.02, 0.98);
    const rankedNeighbors = [...neighborAggregate.values()]
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.bestSimilarity - left.bestSimilarity ||
          Number(right.candidate.entryTime ?? 0) - Number(left.candidate.entryTime ?? 0) ||
          left.candidate.uid.localeCompare(right.candidate.uid)
      )
      .map((entry) =>
        buildEntryNeighbor(entry.candidate, entry.bestSimilarity, entry.score)
      );

    confidenceById.set(trade.id, normalizedConfidence);
    aiEntrySnapshotById.set(trade.id, {
      entryConfidence: normalizedConfidence,
      confidence: normalizedConfidence,
      entryMargin: normalizedConfidence,
      margin: normalizedConfidence,
      aiMode: activeAiMode,
      closestClusterUid:
        rankedNeighbors.length > 0
          ? String(rankedNeighbors[0]?.metaUid ?? rankedNeighbors[0]?.uid ?? "").trim() || null
          : null,
      entryNeighbors: rankedNeighbors
    });
  }

  return {
    dateFilteredTrades: hydrateTradesWithSnapshots(dateFilteredTrades),
    libraryCandidateTrades: hydrateTradesWithSnapshots(splitTrainingTrades),
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
}
