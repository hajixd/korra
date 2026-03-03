/// <reference lib="webworker" />

import {
  computeBacktestHistoryRowsChunk,
  type BacktestHistoryWorkerRequest,
  type BacktestHistoryWorkerResponse
} from "./backtestHistoryShared";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<BacktestHistoryWorkerRequest>) => {
  const {
    requestId,
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
    trailingDistPct
  } = event.data;
  const rows = computeBacktestHistoryRowsChunk({
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
    onProgress: (processed, total, cursorMs) => {
      self.postMessage({
        requestId,
        type: "progress",
        processed,
        total,
        cursorMs
      } satisfies BacktestHistoryWorkerResponse);
    }
  });

  self.postMessage({
    requestId,
    type: "result",
    rows
  } satisfies BacktestHistoryWorkerResponse);
};

export {};
