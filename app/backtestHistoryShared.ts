export type BacktestHistoryTradeResult = "Win" | "Loss";
export type BacktestHistoryTradeSide = "Long" | "Short";

export type BacktestHistoryCandle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

export type BacktestHistoryRow = {
  id: string;
  symbol: string;
  side: BacktestHistoryTradeSide;
  result: BacktestHistoryTradeResult;
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
};

export type BacktestHistoryTradeBlueprint = {
  id: string;
  modelId: string;
  symbol: string;
  side: BacktestHistoryTradeSide;
  result: BacktestHistoryTradeResult;
  entryMs: number;
  exitMs: number;
  riskPct: number;
  rr: number;
  units: number;
};

export type BacktestHistoryWorkerRequest = {
  requestId: number;
  blueprints: BacktestHistoryTradeBlueprint[];
  candleSeriesBySymbol: Record<string, BacktestHistoryCandle[]>;
  modelNamesById: Record<string, string>;
  tpDollars: number;
  slDollars: number;
};

export type BacktestHistoryWorkerResponse = {
  requestId: number;
  rows: BacktestHistoryRow[];
};

const hashString = (value: string) => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash) + 1;
};

const createSeededRng = (seed: number) => {
  let state = seed % 2147483647;

  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 16807) % 2147483647;

    return (state - 1) / 2147483646;
  };
};

const evaluateTpSlPath = (
  candles: BacktestHistoryCandle[],
  side: BacktestHistoryTradeSide,
  entryIndex: number,
  targetPrice: number,
  stopPrice: number,
  toIndex = candles.length - 1
): { hit: boolean; hitIndex: number; outcomePrice: number; result: BacktestHistoryTradeResult | null } => {
  const safeEndIndex = Math.min(Math.max(entryIndex + 1, toIndex), candles.length - 1);
  let hitIndex = -1;
  let outcomePrice = candles[safeEndIndex]?.close ?? candles[entryIndex]?.close ?? 0;
  let result: BacktestHistoryTradeResult | null = null;

  for (let i = entryIndex + 1; i <= safeEndIndex; i += 1) {
    const candle = candles[i];

    if (!candle) {
      break;
    }

    const hitTarget = side === "Long" ? candle.high >= targetPrice : candle.low <= targetPrice;
    const hitStop = side === "Long" ? candle.low <= stopPrice : candle.high >= stopPrice;

    if (!hitTarget && !hitStop) {
      continue;
    }

    hitIndex = i;

    if (hitTarget && hitStop) {
      const targetFirst =
        Math.abs(candle.open - targetPrice) <= Math.abs(candle.open - stopPrice);
      result = targetFirst ? "Win" : "Loss";
      outcomePrice = targetFirst ? targetPrice : stopPrice;
    } else if (hitTarget) {
      result = "Win";
      outcomePrice = targetPrice;
    } else {
      result = "Loss";
      outcomePrice = stopPrice;
    }

    break;
  }

  return { hit: hitIndex >= 0, hitIndex, outcomePrice, result };
};

const findCandleIndexAtOrBefore = (candles: BacktestHistoryCandle[], targetMs: number): number => {
  if (candles.length === 0) {
    return -1;
  }

  if (targetMs < candles[0].time) {
    return -1;
  }

  if (targetMs >= candles[candles.length - 1].time) {
    return candles.length - 1;
  }

  let left = 0;
  let right = candles.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const time = candles[mid].time;

    if (time === targetMs) {
      return mid;
    }

    if (time < targetMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return Math.max(0, right);
};

const toUtcTimestamp = (ms: number): number => {
  return Math.floor(ms / 1000);
};

const formatDateTime = (timestampMs: number): string => {
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

export const computeBacktestHistoryRowsChunk = ({
  blueprints,
  candleSeriesBySymbol,
  modelNamesById,
  tpDollars,
  slDollars
}: Omit<BacktestHistoryWorkerRequest, "requestId">): BacktestHistoryRow[] => {
  const rows: BacktestHistoryRow[] = [];

  for (const blueprint of blueprints) {
    const entryModel = modelNamesById[blueprint.modelId] ?? "Main Settings";
    const list = candleSeriesBySymbol[blueprint.symbol] ?? [];

    if (list.length < 16) {
      continue;
    }

    const entryIndex = findCandleIndexAtOrBefore(list, blueprint.entryMs);
    const rawExitIndex = findCandleIndexAtOrBefore(list, blueprint.exitMs);

    if (entryIndex < 0 || rawExitIndex < 0) {
      continue;
    }

    const exitIndex = Math.min(list.length - 1, Math.max(entryIndex + 1, rawExitIndex));

    if (exitIndex <= entryIndex) {
      continue;
    }

    const entryPrice = list[entryIndex].close;
    const units = Math.max(0.000001, Math.abs(blueprint.units) || 0.000001);
    const tpDistance =
      Number.isFinite(tpDollars) && tpDollars > 0
        ? Math.max(0.000001, tpDollars / units)
        : null;
    const slDistance =
      Number.isFinite(slDollars) && slDollars > 0
        ? Math.max(0.000001, slDollars / units)
        : null;

    let riskPerUnit = 0;
    if (tpDistance == null || slDistance == null) {
      const rand = createSeededRng(hashString(`mapped-${blueprint.id}`));
      let atr = 0;
      let atrCount = 0;

      for (let i = Math.max(1, entryIndex - 20); i <= entryIndex; i += 1) {
        atr += list[i].high - list[i].low;
        atrCount += 1;
      }

      atr /= Math.max(1, atrCount);
      riskPerUnit = Math.max(
        entryPrice * blueprint.riskPct,
        atr * (0.6 + rand() * 0.6),
        entryPrice * 0.0009
      );
    }

    const effectiveTpDistance =
      tpDistance ?? Math.max(0.000001, riskPerUnit * Math.max(0.25, blueprint.rr));
    const effectiveSlDistance =
      slDistance ?? Math.max(0.000001, riskPerUnit);

    const stopPrice =
      blueprint.side === "Long"
        ? Math.max(0.000001, entryPrice - effectiveSlDistance)
        : entryPrice + effectiveSlDistance;
    const targetPrice =
      blueprint.side === "Long"
        ? entryPrice + effectiveTpDistance
        : Math.max(0.000001, entryPrice - effectiveTpDistance);
    const path = evaluateTpSlPath(
      list,
      blueprint.side,
      entryIndex,
      targetPrice,
      stopPrice,
      exitIndex
    );

    const resolvedExitIndex = path.hit ? path.hitIndex : exitIndex;
    const rawOutcomePrice = path.hit ? path.outcomePrice : list[resolvedExitIndex].close;
    const outcomePrice = Math.max(0.000001, rawOutcomePrice);
    const exitReason = path.hit
      ? path.result === "Loss"
        ? "Stop Loss"
        : "Take Profit"
      : "Model Exit";
    const result: BacktestHistoryTradeResult = path.hit
      ? (path.result ?? "Loss")
      : blueprint.side === "Long"
        ? outcomePrice >= entryPrice
          ? "Win"
          : "Loss"
        : outcomePrice <= entryPrice
          ? "Win"
          : "Loss";
    const pnlPct =
      blueprint.side === "Long"
        ? ((outcomePrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - outcomePrice) / entryPrice) * 100;
    const pnlUsd =
      blueprint.side === "Long"
        ? (outcomePrice - entryPrice) * units
        : (entryPrice - outcomePrice) * units;

    rows.push({
      id: blueprint.id,
      symbol: blueprint.symbol,
      side: blueprint.side,
      result,
      entrySource: entryModel,
      exitReason,
      pnlPct,
      pnlUsd,
      entryTime: toUtcTimestamp(list[entryIndex].time),
      exitTime: toUtcTimestamp(list[resolvedExitIndex].time),
      entryPrice,
      targetPrice,
      stopPrice,
      outcomePrice,
      units,
      entryAt: formatDateTime(list[entryIndex].time),
      exitAt: formatDateTime(list[resolvedExitIndex].time),
      time: formatDateTime(list[resolvedExitIndex].time)
    });
  }

  return rows;
};

export const finalizeBacktestHistoryRows = (
  rows: BacktestHistoryRow[],
  limit: number
): BacktestHistoryRow[] => {
  return rows
    .sort((left, right) => right.exitTime - left.exitTime)
    .slice(0, Math.max(0, limit));
};
