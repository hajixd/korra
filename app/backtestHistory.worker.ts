/// <reference lib="webworker" />

import {
  computeBacktestHistoryRowsChunk,
  finalizeBacktestHistoryRows,
  type BacktestHistoryWorkerRequest,
  type BacktestHistoryWorkerResponse
} from "./backtestHistoryShared";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<BacktestHistoryWorkerRequest>) => {
  const request = event.data;

  try {
    const rows = finalizeBacktestHistoryRows(
      computeBacktestHistoryRowsChunk({
        blueprints: request.blueprints,
        candleSeriesBySymbol: request.candleSeriesBySymbol,
        oneMinuteCandlesBySymbol: request.oneMinuteCandlesBySymbol,
        minutePreciseEnabled: request.minutePreciseEnabled,
        modelNamesById: request.modelNamesById,
        tpDollars: request.tpDollars,
        slDollars: request.slDollars,
        stopMode: request.stopMode,
        breakEvenTriggerPct: request.breakEvenTriggerPct,
        trailingStartPct: request.trailingStartPct,
        trailingDistPct: request.trailingDistPct,
        onProgress: (processed, total, cursorMs) => {
          workerScope.postMessage({
            requestId: request.requestId,
            type: "progress",
            processed,
            total,
            cursorMs
          } satisfies BacktestHistoryWorkerResponse);
        }
      }),
      request.limit
    );

    workerScope.postMessage({
      requestId: request.requestId,
      type: "result",
      rows
    } satisfies BacktestHistoryWorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backtest replay worker failed.";
    throw new Error(message);
  }
};
