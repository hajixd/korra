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
    slDollars
  });

  self.postMessage({
    requestId,
    rows
  } satisfies BacktestHistoryWorkerResponse);
};

export {};
