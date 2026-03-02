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
    modelNamesById,
    tpDollars,
    slDollars
  } = event.data;
  const rows = computeBacktestHistoryRowsChunk({
    blueprints,
    candleSeriesBySymbol,
    modelNamesById,
    tpDollars,
    slDollars,
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
