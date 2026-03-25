export type BacktestHistoryTradeResult = "Win" | "Loss";
export type BacktestHistoryTradeSide = "Long" | "Short";
export type BacktestTradeAiMode = "off" | "knn" | "hdbscan";

export type BacktestEntryNeighborTradeRef = {
  id?: string;
  uid?: string;
  tradeUid?: string;
  direction?: number;
  entryTime?: number;
  pnl?: number;
  result?: string;
  session?: string;
  entryModel?: string;
  chunkType?: string;
  model?: string;
  side?: BacktestHistoryTradeSide;
};

export type BacktestEntryNeighbor = {
  uid?: string | null;
  metaUid?: string | null;
  metaTime?: number | null;
  metaPnl?: number | null;
  metaOutcome?: string | null;
  metaSession?: string | null;
  metaLib?: string | null;
  metaSuppressed?: boolean | null;
  dir?: number | null;
  label?: number | null;
  d?: number | null;
  w?: number | null;
  t?: BacktestEntryNeighborTradeRef;
};

export type BacktestTradeAiEntryMeta = {
  entryConfidence?: number | null;
  confidence?: number | null;
  entryMargin?: number | null;
  margin?: number | null;
  aiConfidence?: number | null;
  averageNeighborContributionAtEntry?: number | null;
  aiMode?: BacktestTradeAiMode | null;
  closestClusterUid?: string | null;
  entryNeighbors?: BacktestEntryNeighbor[];
};

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
} & BacktestTradeAiEntryMeta;

export type BacktestHistoryTradeBlueprint = {
  id: string;
  modelId: string;
  symbol: string;
  side: BacktestHistoryTradeSide;
  result: BacktestHistoryTradeResult;
  entryMs: number;
  exitMs: number;
  exitReason?: string;
  riskPct: number;
  rr: number;
  units: number;
} & BacktestTradeAiEntryMeta;

export type BacktestHistoryWorkerRequest = {
  requestId: number;
  blueprints: BacktestHistoryTradeBlueprint[];
  candleSeriesBySymbol: Record<string, BacktestHistoryCandle[]>;
  oneMinuteCandlesBySymbol?: Record<string, BacktestHistoryCandle[]>;
  minutePreciseEnabled?: boolean;
  modelNamesById: Record<string, string>;
  tpDollars: number;
  slDollars: number;
  stopMode: number;
  breakEvenTriggerPct: number;
  trailingStartPct: number;
  trailingDistPct: number;
  limit: number;
};

export type BacktestHistoryComputeRequest = Omit<BacktestHistoryWorkerRequest, "requestId">;

export type BacktestHistoryComputeResponse = {
  rows: BacktestHistoryRow[];
};

export type BacktestHistoryWorkerProgressResponse = {
  requestId: number;
  type: "progress";
  processed: number;
  total: number;
  cursorMs: number;
};

export type BacktestHistoryWorkerResultResponse = {
  requestId: number;
  type: "result";
  rows: BacktestHistoryRow[];
};

export type BacktestHistoryWorkerResponse =
  | BacktestHistoryWorkerProgressResponse
  | BacktestHistoryWorkerResultResponse;

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

const findCandleIndexAtOrBefore = (candles: BacktestHistoryCandle[], targetMs: number): number => {
  if (candles.length === 0) return -1;
  if (targetMs < candles[0].time) return -1;
  if (targetMs >= candles[candles.length - 1].time) return candles.length - 1;

  let left = 0;
  let right = candles.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const time = candles[mid].time;
    if (time === targetMs) return mid;
    if (time < targetMs) left = mid + 1;
    else right = mid - 1;
  }

  return Math.max(0, right);
};

const findCandleIndexAtOrAfter = (candles: BacktestHistoryCandle[], targetMs: number): number => {
  if (candles.length === 0) return -1;
  if (targetMs <= candles[0].time) return 0;
  if (targetMs > candles[candles.length - 1].time) return -1;

  let left = 0;
  let right = candles.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const time = candles[mid].time;
    if (time === targetMs) return mid;
    if (time < targetMs) left = mid + 1;
    else right = mid - 1;
  }

  return Math.min(candles.length - 1, left);
};

const resolveWithOneMinuteCandles = (
  oneMinuteCandles: BacktestHistoryCandle[],
  side: BacktestHistoryTradeSide,
  rangeStartMs: number,
  rangeEndMs: number,
  targetPrice: number,
  stopPrice: number
): { result: BacktestHistoryTradeResult; outcomePrice: number; outcomeTimeMs: number } | null => {
  let startIdx = findCandleIndexAtOrBefore(oneMinuteCandles, rangeStartMs);
  if (startIdx < 0) startIdx = 0;
  if (oneMinuteCandles[startIdx].time < rangeStartMs) startIdx += 1;
  if (startIdx >= oneMinuteCandles.length || oneMinuteCandles[startIdx].time >= rangeEndMs) return null;

  for (let j = startIdx; j < oneMinuteCandles.length; j += 1) {
    const mc = oneMinuteCandles[j];
    if (mc.time >= rangeEndMs) break;

    const mcHitTarget = side === "Long" ? mc.high >= targetPrice : mc.low <= targetPrice;
    const mcHitStop = side === "Long" ? mc.low <= stopPrice : mc.high >= stopPrice;

    if (mcHitTarget && mcHitStop) {
      const targetFirst = Math.abs(mc.open - targetPrice) <= Math.abs(mc.open - stopPrice);
      return {
        result: targetFirst ? "Win" : "Loss",
        outcomePrice: targetFirst ? targetPrice : stopPrice,
        outcomeTimeMs: mc.time
      };
    }
    if (mcHitTarget) return { result: "Win", outcomePrice: targetPrice, outcomeTimeMs: mc.time };
    if (mcHitStop) return { result: "Loss", outcomePrice: stopPrice, outcomeTimeMs: mc.time };
  }

  return null;
};

const resolveEntryWithOneMinuteCandles = (
  oneMinuteCandles: BacktestHistoryCandle[],
  rangeStartMs: number,
  rangeEndMs: number
): { entryPrice: number; entryTimeMs: number } | null => {
  if (!(rangeEndMs > rangeStartMs)) {
    return null;
  }

  const minuteIndex = findCandleIndexAtOrAfter(oneMinuteCandles, rangeStartMs);
  if (minuteIndex < 0) {
    return null;
  }

  const candle = oneMinuteCandles[minuteIndex];
  if (!candle || candle.time >= rangeEndMs) {
    return null;
  }

  return {
    entryPrice: Math.max(0.000001, candle.open),
    entryTimeMs: candle.time
  };
};

const resolveModelExitWithOneMinuteCandles = (
  oneMinuteCandles: BacktestHistoryCandle[],
  rangeStartMs: number,
  rangeEndMs: number
): { outcomePrice: number; outcomeTimeMs: number } | null => {
  if (!(rangeEndMs > rangeStartMs)) {
    return null;
  }

  const minuteIndex = findCandleIndexAtOrAfter(oneMinuteCandles, rangeStartMs);
  if (minuteIndex < 0) {
    return null;
  }

  const firstCandle = oneMinuteCandles[minuteIndex];
  if (!firstCandle || firstCandle.time >= rangeEndMs) {
    return null;
  }

  let lastInRange = firstCandle;

  for (let i = minuteIndex + 1; i < oneMinuteCandles.length; i += 1) {
    const candle = oneMinuteCandles[i];
    if (!candle || candle.time >= rangeEndMs) {
      break;
    }
    lastInRange = candle;
  }

  return {
    outcomePrice: Math.max(0.000001, lastInRange.close),
    outcomeTimeMs: lastInRange.time
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
      result = "Loss";
      outcomePrice = stopPrice;
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

type ComputeBacktestHistoryRowsChunkArgs = Omit<
  BacktestHistoryWorkerRequest,
  "requestId" | "limit"
> & {
  onProgress?: (processed: number, total: number, cursorMs: number) => void;
};

export const computeBacktestHistoryRowsChunk = ({
  blueprints,
  candleSeriesBySymbol,
  oneMinuteCandlesBySymbol,
  minutePreciseEnabled,
  modelNamesById,
  tpDollars,
  slDollars,
  stopMode,
  breakEvenTriggerPct,
  trailingStartPct,
  trailingDistPct,
  onProgress
}: ComputeBacktestHistoryRowsChunkArgs): BacktestHistoryRow[] => {
  const breakEvenOn = stopMode === 1;
  const trailingOn = stopMode === 2;
  const minutePreciseOn = minutePreciseEnabled === true;
  const rows: BacktestHistoryRow[] = [];
  const totalBlueprints = blueprints.length;

  for (let index = 0; index < blueprints.length; index += 1) {
    const blueprint = blueprints[index]!;

    try {
      const entryModel = modelNamesById[blueprint.modelId] ?? "Settings";
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

      const oneMinuteCandles = oneMinuteCandlesBySymbol?.[blueprint.symbol];
      let resolvedEntryTimeMs = list[entryIndex].time;
      let entryPrice = list[entryIndex].close;

      if (minutePreciseOn && oneMinuteCandles && oneMinuteCandles.length > 0) {
        const entryBarStartMs = list[entryIndex].time;
        const entryBarEndMs =
          entryIndex + 1 < list.length
            ? list[entryIndex + 1].time
            : entryBarStartMs + 60_000;
        const oneMinuteEntry = resolveEntryWithOneMinuteCandles(
          oneMinuteCandles,
          entryBarStartMs,
          entryBarEndMs
        );
        if (oneMinuteEntry && oneMinuteEntry.entryTimeMs < list[exitIndex].time) {
          resolvedEntryTimeMs = oneMinuteEntry.entryTimeMs;
          entryPrice = oneMinuteEntry.entryPrice;
        }
      }

      entryPrice = Math.max(0.000001, entryPrice);
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

      const initialStopPrice =
        blueprint.side === "Long"
          ? Math.max(0.000001, entryPrice - effectiveSlDistance)
          : entryPrice + effectiveSlDistance;
      const targetPrice =
        blueprint.side === "Long"
          ? entryPrice + effectiveTpDistance
          : Math.max(0.000001, entryPrice - effectiveTpDistance);

      const tpDistAbs = Math.abs(targetPrice - entryPrice);
      const direction = blueprint.side === "Long" ? 1 : -1;
      let currentStopPrice = initialStopPrice;
      let resolvedExitIndex = exitIndex;
      let outcomePrice = list[exitIndex].close;
      let resolvedExitTimeMs = list[exitIndex].time;
      let exitReason = String(blueprint.exitReason ?? "").trim() || "Model Exit";
      let tradeResult: BacktestHistoryTradeResult | null = null;
      let bestTrail = currentStopPrice;
      const resolveStopExitReason = () => {
        return trailingOn && currentStopPrice !== initialStopPrice
          ? "Trailing Stop"
          : breakEvenOn && currentStopPrice === entryPrice
            ? "Break Even"
            : "Stop Loss";
      };

      const safeEndIndex = Math.min(exitIndex, list.length - 1);

      for (let i = entryIndex + 1; i <= safeEndIndex; i += 1) {
        const bar = list[i];
        if (!bar) break;

        if ((breakEvenOn || trailingOn) && tpDistAbs > 0) {
          if (breakEvenOn) {
            const beMove = tpDistAbs * (breakEvenTriggerPct / 100);
            if (direction === 1) {
              if ((bar.high - entryPrice) >= beMove && currentStopPrice < entryPrice) {
                currentStopPrice = entryPrice;
              }
            } else {
              if ((entryPrice - bar.low) >= beMove && currentStopPrice > entryPrice) {
                currentStopPrice = entryPrice;
              }
            }
          }

          if (trailingOn) {
            const startMove = tpDistAbs * (trailingStartPct / 100);
            const trailDist = tpDistAbs * (trailingDistPct / 100);
            if (direction === 1) {
              if ((bar.high - entryPrice) >= startMove) {
                const candidate = bar.high - trailDist;
                if (candidate > bestTrail) {
                  bestTrail = candidate;
                  if (bestTrail > currentStopPrice) currentStopPrice = bestTrail;
                }
              }
            } else {
              if ((entryPrice - bar.low) >= startMove) {
                const candidate = bar.low + trailDist;
                if (candidate < bestTrail || bestTrail === initialStopPrice) {
                  bestTrail = candidate;
                  if (bestTrail < currentStopPrice || currentStopPrice === initialStopPrice) {
                    currentStopPrice = bestTrail;
                  }
                }
              }
            }
          }
        }

        const hitTarget = direction === 1 ? bar.high >= targetPrice : bar.low <= targetPrice;
        const hitStop = direction === 1 ? bar.low <= currentStopPrice : bar.high >= currentStopPrice;

        if (hitTarget || hitStop) {
          if (minutePreciseOn) {
            const rangeStartMs = Math.max(bar.time, resolvedEntryTimeMs);
            const inferredStepMs =
              i + 1 < list.length
                ? Math.max(60_000, list[i + 1].time - bar.time)
                : Math.max(60_000, i > 0 ? bar.time - list[i - 1].time : 60_000);
            const rangeEndMs = rangeStartMs + inferredStepMs;
            const oneMinuteExit =
              oneMinuteCandles && oneMinuteCandles.length > 0
                ? resolveWithOneMinuteCandles(
                    oneMinuteCandles,
                    blueprint.side,
                    rangeStartMs,
                    rangeEndMs,
                    targetPrice,
                    currentStopPrice
                  )
                : null;

            if (oneMinuteExit) {
              tradeResult = oneMinuteExit.result;
              outcomePrice = oneMinuteExit.outcomePrice;
              resolvedExitTimeMs = oneMinuteExit.outcomeTimeMs;
            } else if (hitTarget && hitStop) {
              const targetFirst =
                Math.abs(bar.open - targetPrice) <= Math.abs(bar.open - currentStopPrice);
              tradeResult = targetFirst ? "Win" : "Loss";
              outcomePrice = targetFirst ? targetPrice : currentStopPrice;
              resolvedExitTimeMs = bar.time;
            } else if (hitTarget) {
              tradeResult = "Win";
              outcomePrice = targetPrice;
              resolvedExitTimeMs = bar.time;
            } else {
              tradeResult = "Loss";
              outcomePrice = currentStopPrice;
              resolvedExitTimeMs = bar.time;
            }

            resolvedExitIndex = i;
            exitReason = tradeResult === "Loss" ? resolveStopExitReason() : "Take Profit";
            break;
          }

          if (hitTarget && hitStop) {
            let resolved = false;
            if (oneMinuteCandles && oneMinuteCandles.length > 0) {
              const rangeStartMs = bar.time;
              const rangeEndMs = i + 1 < list.length ? list[i + 1].time : bar.time + 60_000;
              const omResult = resolveWithOneMinuteCandles(
                oneMinuteCandles,
                blueprint.side,
                rangeStartMs,
                rangeEndMs,
                targetPrice,
                currentStopPrice
              );
              if (omResult) {
                tradeResult = omResult.result;
                outcomePrice = omResult.outcomePrice;
                resolved = true;
              }
            }
            if (!resolved) {
              const targetFirst =
                Math.abs(bar.open - targetPrice) <= Math.abs(bar.open - currentStopPrice);
              tradeResult = targetFirst ? "Win" : "Loss";
              outcomePrice = targetFirst ? targetPrice : currentStopPrice;
            }
            resolvedExitIndex = i;
            resolvedExitTimeMs = bar.time;
            exitReason = tradeResult === "Loss" ? resolveStopExitReason() : "Take Profit";
            break;
          }

          if (hitTarget) {
            tradeResult = "Win";
            outcomePrice = targetPrice;
            resolvedExitIndex = i;
            resolvedExitTimeMs = bar.time;
            exitReason = "Take Profit";
            break;
          }

          tradeResult = "Loss";
          outcomePrice = currentStopPrice;
          resolvedExitIndex = i;
          resolvedExitTimeMs = bar.time;
          exitReason = resolveStopExitReason();
          break;
        }
      }

      outcomePrice = Math.max(0.000001, outcomePrice);

      if (tradeResult === null) {
        outcomePrice = Math.max(0.000001, list[resolvedExitIndex].close);
        resolvedExitTimeMs = list[resolvedExitIndex].time;
        if (minutePreciseOn && oneMinuteCandles && oneMinuteCandles.length > 0) {
          const exitBarStartMs = list[resolvedExitIndex].time;
          const exitBarStepMs =
            resolvedExitIndex + 1 < list.length
              ? Math.max(60_000, list[resolvedExitIndex + 1].time - exitBarStartMs)
              : Math.max(
                  60_000,
                  resolvedExitIndex > 0 ? exitBarStartMs - list[resolvedExitIndex - 1].time : 60_000
                );
          const exitBarEndMs = exitBarStartMs + exitBarStepMs;
          const oneMinuteModelExit = resolveModelExitWithOneMinuteCandles(
            oneMinuteCandles,
            Math.max(resolvedEntryTimeMs, exitBarStartMs),
            exitBarEndMs
          );
          if (oneMinuteModelExit) {
            outcomePrice = oneMinuteModelExit.outcomePrice;
            resolvedExitTimeMs = oneMinuteModelExit.outcomeTimeMs;
          }
        }
        tradeResult = blueprint.side === "Long"
          ? outcomePrice >= entryPrice ? "Win" : "Loss"
          : outcomePrice <= entryPrice ? "Win" : "Loss";
      }

      const result: BacktestHistoryTradeResult = tradeResult;
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
        entryTime: toUtcTimestamp(resolvedEntryTimeMs),
        exitTime: toUtcTimestamp(resolvedExitTimeMs),
        entryPrice,
        targetPrice,
        stopPrice: currentStopPrice,
        outcomePrice,
        units,
        entryAt: formatDateTime(resolvedEntryTimeMs),
        exitAt: formatDateTime(resolvedExitTimeMs),
        time: formatDateTime(resolvedExitTimeMs),
        entryConfidence: blueprint.entryConfidence ?? null,
        confidence:
          blueprint.confidence ??
          blueprint.entryConfidence ??
          null,
        entryMargin:
          blueprint.entryMargin ??
          blueprint.entryConfidence ??
          blueprint.confidence ??
          null,
        margin:
          blueprint.margin ??
          blueprint.entryMargin ??
          blueprint.entryConfidence ??
          blueprint.confidence ??
          null,
        aiConfidence: blueprint.aiConfidence ?? null,
        averageNeighborContributionAtEntry:
          blueprint.averageNeighborContributionAtEntry ?? null,
        aiMode: blueprint.aiMode ?? null,
        closestClusterUid: blueprint.closestClusterUid ?? null,
        entryNeighbors: Array.isArray(blueprint.entryNeighbors)
          ? blueprint.entryNeighbors.slice()
          : []
      });
    } finally {
      if (onProgress) {
        onProgress(
          index + 1,
          totalBlueprints,
          Math.max(blueprint.entryMs, blueprint.exitMs)
        );
      }
    }
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
