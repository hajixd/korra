export type BrowserCachedCandle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
  volume?: number;
};

type BrowserCandleCacheRecord = {
  key: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  candleCount: number;
  payload: Float64Array;
};

const BROWSER_CANDLE_CACHE_DB_NAME = "korra-browser-candle-cache";
const BROWSER_CANDLE_CACHE_DB_VERSION = 1;
const BROWSER_CANDLE_CACHE_STORE = "candles";
const BROWSER_CANDLE_CACHE_UPDATED_AT_INDEX = "updatedAt";
const BROWSER_CANDLE_CACHE_EXPIRES_AT_INDEX = "expiresAt";
const BROWSER_CANDLE_CACHE_MAX_ENTRIES = 6;

let browserCandleCacheDbPromise: Promise<IDBDatabase | null> | null = null;

const supportsBrowserCandleCache = () => {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
};

const runIdbRequest = <T,>(request: IDBRequest<T>): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
};

const waitForTransaction = (transaction: IDBTransaction): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
};

const openBrowserCandleCacheDb = async (): Promise<IDBDatabase | null> => {
  if (!supportsBrowserCandleCache()) {
    return null;
  }

  if (!browserCandleCacheDbPromise) {
    browserCandleCacheDbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = window.indexedDB.open(
          BROWSER_CANDLE_CACHE_DB_NAME,
          BROWSER_CANDLE_CACHE_DB_VERSION
        );

        request.onupgradeneeded = () => {
          const database = request.result;
          const store = database.objectStoreNames.contains(BROWSER_CANDLE_CACHE_STORE)
            ? request.transaction?.objectStore(BROWSER_CANDLE_CACHE_STORE) ?? null
            : database.createObjectStore(BROWSER_CANDLE_CACHE_STORE, {
                keyPath: "key"
              });

          if (!store) {
            return;
          }

          if (!store.indexNames.contains(BROWSER_CANDLE_CACHE_UPDATED_AT_INDEX)) {
            store.createIndex(BROWSER_CANDLE_CACHE_UPDATED_AT_INDEX, "updatedAt");
          }
          if (!store.indexNames.contains(BROWSER_CANDLE_CACHE_EXPIRES_AT_INDEX)) {
            store.createIndex(BROWSER_CANDLE_CACHE_EXPIRES_AT_INDEX, "expiresAt");
          }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  return browserCandleCacheDbPromise;
};

const packBrowserCachedCandles = (candles: readonly BrowserCachedCandle[]) => {
  const packed = new Float64Array(candles.length * 6);

  candles.forEach((candle, index) => {
    const offset = index * 6;
    packed[offset] = Number(candle.time) || 0;
    packed[offset + 1] = Number(candle.open) || 0;
    packed[offset + 2] = Number(candle.high) || 0;
    packed[offset + 3] = Number(candle.low) || 0;
    packed[offset + 4] = Number(candle.close) || 0;
    const volume = Number(candle.volume);
    packed[offset + 5] = Number.isFinite(volume) ? volume : Number.NaN;
  });

  return packed;
};

const unpackBrowserCachedCandles = (
  payload: unknown,
  candleCount: number
): BrowserCachedCandle[] => {
  const packed =
    payload instanceof Float64Array
      ? payload
      : payload instanceof ArrayBuffer
        ? new Float64Array(payload)
        : null;

  if (!packed || packed.length < 6) {
    return [];
  }

  const safeCount = Math.min(Math.max(0, Math.trunc(candleCount || 0)), Math.floor(packed.length / 6));
  const candles: BrowserCachedCandle[] = [];

  for (let index = 0; index < safeCount; index += 1) {
    const offset = index * 6;
    const time = packed[offset] ?? Number.NaN;
    const open = packed[offset + 1] ?? Number.NaN;
    const high = packed[offset + 2] ?? Number.NaN;
    const low = packed[offset + 3] ?? Number.NaN;
    const close = packed[offset + 4] ?? Number.NaN;
    const volume = packed[offset + 5] ?? Number.NaN;

    if (
      !Number.isFinite(time) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }

    candles.push({
      time,
      open,
      high,
      low,
      close,
      ...(Number.isFinite(volume) ? { volume } : {})
    });
  }

  return candles;
};

const deleteExpiredBrowserCandleCacheEntries = async (
  store: IDBObjectStore,
  nowMs: number
) => {
  const expiresAtIndex = store.index(BROWSER_CANDLE_CACHE_EXPIRES_AT_INDEX);

  await new Promise<void>((resolve, reject) => {
    const request = expiresAtIndex.openCursor(IDBKeyRange.upperBound(nowMs));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }

      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Failed pruning expired candle cache."));
  });
};

const pruneOldestBrowserCandleCacheEntries = async (
  store: IDBObjectStore,
  surplusEntryCount: number
) => {
  if (surplusEntryCount <= 0) {
    return;
  }

  const updatedAtIndex = store.index(BROWSER_CANDLE_CACHE_UPDATED_AT_INDEX);
  let remaining = surplusEntryCount;

  await new Promise<void>((resolve, reject) => {
    const request = updatedAtIndex.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || remaining <= 0) {
        resolve();
        return;
      }

      remaining -= 1;
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Failed pruning old candle cache."));
  });
};

const pruneBrowserCandleCache = async (nowMs: number) => {
  const database = await openBrowserCandleCacheDb();
  if (!database) {
    return;
  }

  try {
    const expireTransaction = database.transaction(BROWSER_CANDLE_CACHE_STORE, "readwrite");
    await deleteExpiredBrowserCandleCacheEntries(
      expireTransaction.objectStore(BROWSER_CANDLE_CACHE_STORE),
      nowMs
    );
    await waitForTransaction(expireTransaction);

    const pruneTransaction = database.transaction(BROWSER_CANDLE_CACHE_STORE, "readwrite");
    const pruneStore = pruneTransaction.objectStore(BROWSER_CANDLE_CACHE_STORE);
    const entryCount = await runIdbRequest(pruneStore.count());
    await pruneOldestBrowserCandleCacheEntries(
      pruneStore,
      Math.max(0, Number(entryCount) - BROWSER_CANDLE_CACHE_MAX_ENTRIES)
    );
    await waitForTransaction(pruneTransaction);
  } catch {
    // Persistent cache is best-effort only.
  }
};

export const readBrowserCandleCache = async (
  key: string,
  nowMs = Date.now()
): Promise<BrowserCachedCandle[] | null> => {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) {
    return null;
  }

  const database = await openBrowserCandleCacheDb();
  if (!database) {
    return null;
  }

  try {
    const transaction = database.transaction(BROWSER_CANDLE_CACHE_STORE, "readonly");
    const store = transaction.objectStore(BROWSER_CANDLE_CACHE_STORE);
    const record = (await runIdbRequest(
      store.get(normalizedKey)
    )) as BrowserCandleCacheRecord | undefined;
    await waitForTransaction(transaction);

    if (!record) {
      return null;
    }

    if (!Number.isFinite(record.expiresAt) || record.expiresAt <= nowMs) {
      void pruneBrowserCandleCache(nowMs);
      return null;
    }

    return unpackBrowserCachedCandles(record.payload, record.candleCount);
  } catch {
    return null;
  }
};

export const writeBrowserCandleCache = async (params: {
  key: string;
  candles: readonly BrowserCachedCandle[];
  expiresAt: number;
  nowMs?: number;
}) => {
  const normalizedKey = String(params.key ?? "").trim();
  if (!normalizedKey || !Array.isArray(params.candles) || params.candles.length === 0) {
    return;
  }

  const database = await openBrowserCandleCacheDb();
  if (!database) {
    return;
  }

  const nowMs = Number.isFinite(params.nowMs) ? Number(params.nowMs) : Date.now();

  try {
    const transaction = database.transaction(BROWSER_CANDLE_CACHE_STORE, "readwrite");
    const store = transaction.objectStore(BROWSER_CANDLE_CACHE_STORE);

    await runIdbRequest(
      store.put({
        key: normalizedKey,
        createdAt: nowMs,
        updatedAt: nowMs,
        expiresAt: Number(params.expiresAt) || nowMs,
        candleCount: params.candles.length,
        payload: packBrowserCachedCandles(params.candles)
      } satisfies BrowserCandleCacheRecord)
    );
    await waitForTransaction(transaction);
    void pruneBrowserCandleCache(nowMs);
  } catch {
    // Persistent cache is best-effort only.
  }
};
