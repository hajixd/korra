import { getGoogleAccessToken, googleServiceAccountReady } from "./googleServiceAccount";
import { getFallbackEnvValue } from "./serverEnvFallback";
import type { TwelveDataCandleRecord } from "./twelveDataMarketData";

const GOOGLE_STORAGE_SCOPES = ["https://www.googleapis.com/auth/devstorage.read_write"];
const STORAGE_BUCKET =
  getFallbackEnvValue("FIREBASE_STORAGE_BUCKET") ||
  getFallbackEnvValue("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET");
const STORAGE_CACHE_PREFIX = "market-history-cache-v1";

type StoredCandleTuple = [
  number,
  number,
  number,
  number,
  number,
  number | null
];

type StorageChunkPayload = {
  pair: string;
  timeframe: string;
  coveredStartMs: number;
  coveredEndMs: number;
  updatedAtMs: number;
  candles: StoredCandleTuple[];
};

type MarketHistoryChunkWindow = {
  chunkKey: string;
  startMs: number;
  endMs: number;
};

type CachedChunkState = {
  chunkKey: string;
  windowStartMs: number;
  windowEndMs: number;
  neededStartMs: number;
  neededEndMs: number;
  cached: StorageChunkPayload | null;
};

export const firebaseHistoryStorageCacheReady =
  googleServiceAccountReady && String(STORAGE_BUCKET).trim().length > 0;

const getStorageAuthHeader = async () => {
  const token = await getGoogleAccessToken(GOOGLE_STORAGE_SCOPES);
  if (!token) {
    return null;
  }

  return {
    Authorization: `Bearer ${token.accessToken}`
  };
};

const normalizeStorageBucket = () => String(STORAGE_BUCKET ?? "").trim();

const getChunkObjectName = (pair: string, timeframe: string, chunkKey: string) => {
  const safePair = pair.replace(/[^A-Z0-9_]/g, "_");
  const safeTimeframe = timeframe.replace(/[^A-Z0-9]/g, "_");
  return `${STORAGE_CACHE_PREFIX}/${safePair}/${safeTimeframe}/${chunkKey}.json`;
};

const buildMonthlyChunkWindows = (startMs: number, endMs: number): MarketHistoryChunkWindow[] => {
  const windows: MarketHistoryChunkWindow[] = [];
  const cursor = new Date(startMs);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= endMs) {
    const year = cursor.getUTCFullYear();
    const monthIndex = cursor.getUTCMonth();
    const chunkStartMs = Date.UTC(year, monthIndex, 1, 0, 0, 0, 0);
    const nextMonthStartMs = Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0);
    const chunkEndMs = nextMonthStartMs - 1;
    const chunkKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

    windows.push({
      chunkKey,
      startMs: chunkStartMs,
      endMs: chunkEndMs
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return windows;
};

const sortAndDedupeCandles = (candles: TwelveDataCandleRecord[]): TwelveDataCandleRecord[] => {
  const deduped = new Map<number, TwelveDataCandleRecord>();

  for (const candle of candles) {
    const time = Number(candle.time);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const volumeRaw = Number(candle.volume);

    if (
      !Number.isFinite(time) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }

    deduped.set(time, {
      time,
      pair: String(candle.pair ?? "").trim().toUpperCase(),
      timeframe: String(candle.timeframe ?? "").trim().toUpperCase(),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volumeRaw) ? volumeRaw : 0
    });
  }

  return [...deduped.values()].sort((left, right) => left.time - right.time);
};

const encodeChunkPayload = (payload: StorageChunkPayload) =>
  JSON.stringify({
    ...payload,
    candles: payload.candles
  });

const decodeChunkPayload = (text: string): StorageChunkPayload | null => {
  try {
    const parsed = JSON.parse(text) as Partial<StorageChunkPayload>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.candles) ||
      !Number.isFinite(parsed.coveredStartMs) ||
      !Number.isFinite(parsed.coveredEndMs)
    ) {
      return null;
    }

    const candles: StoredCandleTuple[] = [];
    for (const entry of parsed.candles) {
      if (!Array.isArray(entry) || entry.length < 5) {
        continue;
      }

      const time = Number(entry[0]);
      const open = Number(entry[1]);
      const high = Number(entry[2]);
      const low = Number(entry[3]);
      const close = Number(entry[4]);
      const volume = entry.length > 5 ? Number(entry[5]) : Number.NaN;

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        continue;
      }

      candles.push([time, open, high, low, close, Number.isFinite(volume) ? volume : null]);
    }

    return {
      pair: String(parsed.pair ?? "").trim().toUpperCase(),
      timeframe: String(parsed.timeframe ?? "").trim().toUpperCase(),
      coveredStartMs: Math.trunc(Number(parsed.coveredStartMs) || 0),
      coveredEndMs: Math.trunc(Number(parsed.coveredEndMs) || 0),
      updatedAtMs: Math.trunc(Number(parsed.updatedAtMs) || 0),
      candles
    };
  } catch {
    return null;
  }
};

const tuplesToCandles = (
  tuples: StoredCandleTuple[],
  pair: string,
  timeframe: string
): TwelveDataCandleRecord[] => {
  return tuples.map((tuple) => ({
    time: Number(tuple[0]) || 0,
    pair,
    timeframe,
    open: Number(tuple[1]) || 0,
    high: Number(tuple[2]) || 0,
    low: Number(tuple[3]) || 0,
    close: Number(tuple[4]) || 0,
    volume: Number.isFinite(Number(tuple[5])) ? Number(tuple[5]) : 0
  }));
};

const candlesToTuples = (candles: TwelveDataCandleRecord[]): StoredCandleTuple[] => {
  return candles.map((candle) => [
    Number(candle.time) || 0,
    Number(candle.open) || 0,
    Number(candle.high) || 0,
    Number(candle.low) || 0,
    Number(candle.close) || 0,
    Number.isFinite(Number(candle.volume)) ? Number(candle.volume) : null
  ]);
};

const readStoredChunk = async (
  pair: string,
  timeframe: string,
  chunkKey: string
): Promise<StorageChunkPayload | null> => {
  const authHeader = await getStorageAuthHeader();
  const bucket = normalizeStorageBucket();
  if (!authHeader || !bucket) {
    return null;
  }

  const objectName = getChunkObjectName(pair, timeframe, chunkKey);
  const response = await fetch(
    `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`,
    {
      headers: {
        ...authHeader
      },
      cache: "no-store"
    }
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Firebase Storage cache read failed (${response.status}).`);
  }

  return decodeChunkPayload(await response.text());
};

const writeStoredChunk = async (
  pair: string,
  timeframe: string,
  chunkKey: string,
  payload: StorageChunkPayload
) => {
  const authHeader = await getStorageAuthHeader();
  const bucket = normalizeStorageBucket();
  if (!authHeader || !bucket) {
    return;
  }

  const objectName = getChunkObjectName(pair, timeframe, chunkKey);
  const response = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
    {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: encodeChunkPayload(payload)
    }
  );

  if (!response.ok) {
    throw new Error(`Firebase Storage cache write failed (${response.status}).`);
  }
};

const runWithConcurrency = async <T,>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) => {
  const safeConcurrency = Math.max(1, Math.min(items.length || 1, concurrency));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: safeConcurrency }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        await worker(items[index]!, index);
      }
    })
  );
};

const clampRangeToChunk = (startMs: number, endMs: number, window: MarketHistoryChunkWindow) => {
  return {
    neededStartMs: Math.max(startMs, window.startMs),
    neededEndMs: Math.min(endMs, window.endMs)
  };
};

const mergeChunkCandles = (
  cached: StorageChunkPayload | null,
  fetched: TwelveDataCandleRecord[],
  neededStartMs: number,
  neededEndMs: number,
  pair: string,
  timeframe: string
): StorageChunkPayload => {
  const mergedCandles = sortAndDedupeCandles([
    ...tuplesToCandles(cached?.candles ?? [], pair, timeframe),
    ...fetched
  ]);

  return {
    pair,
    timeframe,
    coveredStartMs:
      cached == null
        ? neededStartMs
        : Math.min(cached.coveredStartMs, neededStartMs),
    coveredEndMs:
      cached == null
        ? neededEndMs
        : Math.max(cached.coveredEndMs, neededEndMs),
    updatedAtMs: Date.now(),
    candles: candlesToTuples(mergedCandles)
  };
};

export const loadFirebaseBackedHistoryRange = async (params: {
  pair: string;
  timeframe: string;
  startMs: number;
  endMs: number;
  fetchRange: (range: {
    startMs: number;
    endMs: number;
  }) => Promise<TwelveDataCandleRecord[]>;
}): Promise<TwelveDataCandleRecord[] | null> => {
  const pair = String(params.pair ?? "").trim().toUpperCase();
  const timeframe = String(params.timeframe ?? "").trim().toUpperCase();
  const startMs = Math.trunc(Number(params.startMs) || 0);
  const endMs = Math.trunc(Number(params.endMs) || 0);

  if (!firebaseHistoryStorageCacheReady || !pair || !timeframe || endMs < startMs) {
    return null;
  }

  const windows = buildMonthlyChunkWindows(startMs, endMs);
  const chunkStates: CachedChunkState[] = windows.map((window) => {
    const { neededStartMs, neededEndMs } = clampRangeToChunk(startMs, endMs, window);
    return {
      chunkKey: window.chunkKey,
      windowStartMs: window.startMs,
      windowEndMs: window.endMs,
      neededStartMs,
      neededEndMs,
      cached: null
    };
  });

  await runWithConcurrency(chunkStates, 6, async (state) => {
    state.cached = await readStoredChunk(pair, timeframe, state.chunkKey);
  });

  await runWithConcurrency(chunkStates, 2, async (state) => {
    const cached = state.cached;
    const fetchedCandles: TwelveDataCandleRecord[] = [];

    if (!cached || cached.coveredStartMs > state.neededStartMs) {
      fetchedCandles.push(
        ...(await params.fetchRange({
          startMs: state.neededStartMs,
          endMs: cached ? Math.min(state.neededEndMs, cached.coveredStartMs - 1) : state.neededEndMs
        }))
      );
    }

    if (!cached || cached.coveredEndMs < state.neededEndMs) {
      const nextStartMs = cached
        ? Math.max(state.neededStartMs, cached.coveredEndMs + 1)
        : state.neededStartMs;
      const nextEndMs = state.neededEndMs;

      if (nextEndMs >= nextStartMs) {
        fetchedCandles.push(
          ...(await params.fetchRange({
            startMs: nextStartMs,
            endMs: nextEndMs
          }))
        );
      }
    }

    if (fetchedCandles.length === 0) {
      return;
    }

    const merged = mergeChunkCandles(
      cached,
      fetchedCandles,
      state.neededStartMs,
      state.neededEndMs,
      pair,
      timeframe
    );
    state.cached = merged;
    await writeStoredChunk(pair, timeframe, state.chunkKey, merged);
  });

  return sortAndDedupeCandles(
    chunkStates.flatMap((state) => {
      const cached = state.cached;
      if (!cached) {
        return [] as TwelveDataCandleRecord[];
      }

      return tuplesToCandles(cached.candles, pair, timeframe).filter(
        (candle) => candle.time >= state.neededStartMs && candle.time <= state.neededEndMs
      );
    })
  ).filter((candle) => candle.time >= startMs && candle.time <= endMs);
};
