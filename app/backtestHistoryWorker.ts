/// <reference lib="webworker" />

import {
  computeBacktestHistoryRowsChunk,
  type BacktestHistoryWorkerRequest,
  type BacktestHistoryWorkerResponse
} from "./backtestHistoryShared";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<BacktestHistoryWorkerRequest>) => {
  const { requestId, blueprints, candleSeriesBySymbol, modelNamesById } = event.data;
  const rows = computeBacktestHistoryRowsChunk({
    blueprints,
    candleSeriesBySymbol,
    modelNamesById
  });

  self.postMessage({
    requestId,
    rows
  } satisfies BacktestHistoryWorkerResponse);
};

export {};
