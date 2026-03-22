export const DATABENTO_DEFAULT_PAIR = "XAU_USD";
export const DATABENTO_DEFAULT_CONTINUOUS_SYMBOL =
  process.env.DATABENTO_GOLD_CONTINUOUS_SYMBOL || "GC.v.0";
export const DATABENTO_SUPPORTED_TIMEFRAMES = new Set([
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D",
  "W",
  "M"
]);
export const DATABENTO_SUPPORTED_PAIRS = new Set([DATABENTO_DEFAULT_PAIR]);

const DATABENTO_DATASET = "GLBX.MDP3";
const DATABENTO_HISTORICAL_API_BASE = "https://hist.databento.com/v0";
const PRICE_SCALE = 1_000_000_000;
const RANGE_CACHE_TTL_MS = 60_000;
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const QUOTE_POLL_LOOKBACK_MS = 120_000;

const BASE_SCHEMA_BY_TIMEFRAME: Record<string, string> = {
  M1: "ohlcv-1m",
  M5: "ohlcv-1m",
  M15: "ohlcv-1m",
  M30: "ohlcv-1m",
  H1: "ohlcv-1h",
  H4: "ohlcv-1h",
  D: "ohlcv-1d",
  W: "ohlcv-1d",
  M: "ohlcv-1d"
};

const TIMEFRAME_MS: Record<string, number> = {
  M1: 60_000,
  M5: 5 * 60_000,
  M15: 15 * 60_000,
  M30: 30 * 60_000,
  H1: 60 * 60_000,
  H4: 4 * 60 * 60_000,
  D: 24 * 60 * 60_000,
  W: 7 * 24 * 60 * 60_000,
  M: 31 * 24 * 60 * 60_000
};

const LOOKBACK_FACTOR: Record<string, number> = {
  M1: 1.85,
  M5: 1.85,
  M15: 1.85,
  M30: 1.85,
  H1: 1.85,
  H4: 1.85,
  D: 1.55,
  W: 1.35,
  M: 1.35
};

const MIN_LOOKBACK_MS: Record<string, number> = {
  M1: 5 * 24 * 60 * 60_000,
  M5: 5 * 24 * 60 * 60_000,
  M15: 5 * 24 * 60 * 60_000,
  M30: 5 * 24 * 60 * 60_000,
  H1: 7 * 24 * 60 * 60_000,
  H4: 14 * 24 * 60 * 60_000,
  D: 45 * 24 * 60 * 60_000,
  W: 400 * 24 * 60 * 60_000,
  M: 1800 * 24 * 60 * 60_000
};

type DatasetRange = {
  start?: string;
  end?: string;
  schema?: Record<
    string,
    {
      start?: string;
      end?: string;
    }
  >;
};

type DatabentoJsonLine = Record<string, unknown>;

export type DatabentoCandleRecord = {
  time: number;
  pair: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DatabentoCandlesPayload = {
  pair: string;
  timeframe: string;
  start: string | null;
  end: string | null;
  count: number;
  candles: DatabentoCandleRecord[];
  source?: string;
};

export type DatabentoQuotePayload = {
  pair: string;
  continuous_symbol: string;
  raw_symbol: string | null;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  time: string;
  source: string;
};

let cachedRange: { expiresAt: number; value: DatasetRange } | null = null;

const getApiKey = (): string => {
  const key = (process.env.DATABENTO_API_KEY || "").trim();
  if (!key) {
    throw new Error("Missing DATABENTO_API_KEY.");
  }
  return key;
};

const buildAuthHeader = () =>
  `Basic ${Buffer.from(`${getApiKey()}:`, "utf8").toString("base64")}`;

const parseTimeMs = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toFiniteNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return Number.NaN;
};

const toEpochMs = (value: unknown): number => {
  const numeric = toFiniteNumber(value);
  if (Number.isFinite(numeric)) {
    if (Math.abs(numeric) >= 1_000_000_000_000_000) {
      return Math.floor(numeric / 1_000_000);
    }
    if (Math.abs(numeric) >= 1_000_000_000_000) {
      return Math.floor(numeric);
    }
    if (Math.abs(numeric) >= 1_000_000_000) {
      return Math.floor(numeric * 1000);
    }
  }

  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const toPrice = (value: unknown): number => {
  const numeric = toFiniteNumber(value);
  if (!Number.isFinite(numeric)) {
    return Number.NaN;
  }
  return Math.abs(numeric) >= 1_000_000 ? numeric / PRICE_SCALE : numeric;
};

const getSchemaForTimeframe = (timeframe: string): string => {
  return BASE_SCHEMA_BY_TIMEFRAME[timeframe] || "ohlcv-1m";
};

const estimateLookbackMs = (timeframe: string, count: number): number => {
  const paddedCount = Math.max(64, count + 32);
  const durationMs =
    TIMEFRAME_MS[timeframe] * paddedCount * (LOOKBACK_FACTOR[timeframe] || LOOKBACK_FACTOR.M1);
  return Math.max(MIN_LOOKBACK_MS[timeframe] || MIN_LOOKBACK_MS.M1, Math.ceil(durationMs));
};

const floorToTimeframe = (timestampMs: number, timeframe: string): number => {
  if (timeframe === "W") {
    const date = new Date(timestampMs);
    const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const mondayBasedWeekday = (date.getUTCDay() + 6) % 7;
    return dayStart - mondayBasedWeekday * 24 * 60 * 60_000;
  }

  if (timeframe === "M") {
    const date = new Date(timestampMs);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }

  const stepMs = TIMEFRAME_MS[timeframe] || TIMEFRAME_MS.M1;
  return Math.floor(timestampMs / stepMs) * stepMs;
};

const isXauTradingTime = (timestampMs: number): boolean => {
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();

  if (day === 6) {
    return false;
  }
  if (day === 5 && hour >= 22) {
    return false;
  }
  if (day === 0 && hour < 23) {
    return false;
  }
  if (day >= 1 && day <= 4 && hour === 22) {
    return false;
  }

  return true;
};

const parseDatabentoError = (status: number, body: string): string => {
  try {
    const payload = JSON.parse(body) as {
      detail?: {
        case?: string;
        message?: string;
        docs?: string;
      };
    };
    const detail = payload.detail;
    if (!detail) {
      return `Databento HTTP ${status}: ${body.slice(0, 400)}`;
    }

    const lines = [`${status} ${detail.case || "error"}`, detail.message || "Unknown Databento error."];
    if (detail.docs) {
      lines.push(`documentation: ${detail.docs}`);
    }
    return lines.join("\n");
  } catch {
    return `Databento HTTP ${status}: ${body.slice(0, 400)}`;
  }
};

const databentoGet = async (
  method: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
): Promise<Response> => {
  const url = new URL(`${DATABENTO_HISTORICAL_API_BASE}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: buildAuthHeader()
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(parseDatabentoError(response.status, body));
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

const databentoGetJson = async <T>(
  method: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
): Promise<T> => {
  const response = await databentoGet(method, params, timeoutMs);
  return (await response.json()) as T;
};

const databentoGetJsonLines = async (
  method: string,
  params: Record<string, string | number | undefined>,
  timeoutMs = DEFAULT_HTTP_TIMEOUT_MS
): Promise<DatabentoJsonLine[]> => {
  const response = await databentoGet(method, params, timeoutMs);
  const text = await response.text();

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as DatabentoJsonLine);
};

const getDatasetRange = async (): Promise<DatasetRange> => {
  const now = Date.now();
  if (cachedRange && cachedRange.expiresAt > now) {
    return cachedRange.value;
  }

  const value = await databentoGetJson<DatasetRange>(
    "metadata.get_dataset_range",
    { dataset: DATABENTO_DATASET },
    15_000
  );

  cachedRange = {
    value,
    expiresAt: now + RANGE_CACHE_TTL_MS
  };

  return value;
};

export const probeDatabentoAccess = async (): Promise<void> => {
  await getDatasetRange();
};

const clipToSchemaEnd = async (
  timeframe: string,
  requestedEnd?: string | null
): Promise<string | null> => {
  const range = await getDatasetRange();
  const schema = getSchemaForTimeframe(timeframe);
  const availableEnd = range.schema?.[schema]?.end || range.end || null;
  const availableEndMs = parseTimeMs(availableEnd);
  const requestedEndMs = parseTimeMs(requestedEnd);

  if (availableEndMs === null) {
    return requestedEnd || null;
  }
  if (requestedEndMs === null) {
    return new Date(availableEndMs).toISOString();
  }

  return requestedEndMs > availableEndMs
    ? new Date(availableEndMs).toISOString()
    : new Date(requestedEndMs).toISOString();
};

const clipToSchemaStart = async (
  timeframe: string,
  requestedStart?: string | null
): Promise<string | null> => {
  const requestedStartMs = parseTimeMs(requestedStart);
  if (requestedStartMs === null) {
    return requestedStart || null;
  }

  const range = await getDatasetRange();
  const schema = getSchemaForTimeframe(timeframe);
  const availableStart = range.schema?.[schema]?.start || range.start || null;
  const availableStartMs = parseTimeMs(availableStart);

  if (availableStartMs === null || requestedStartMs >= availableStartMs) {
    return new Date(requestedStartMs).toISOString();
  }

  return new Date(availableStartMs).toISOString();
};

const normalizeDatabentoOhlcvRecords = (
  records: DatabentoJsonLine[],
  timeframe: string
): DatabentoCandleRecord[] => {
  const normalized = records
    .map((record) => {
      const time = toEpochMs(record.ts_event);
      const open = toPrice(record.open);
      const high = toPrice(record.high);
      const low = toPrice(record.low);
      const close = toPrice(record.close);
      const volume = toFiniteNumber(record.volume);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        !Number.isFinite(volume) ||
        !isXauTradingTime(time)
      ) {
        return null;
      }

      return {
        time,
        pair: DATABENTO_DEFAULT_PAIR,
        timeframe,
        open,
        high,
        low,
        close,
        volume
      };
    })
    .filter((record): record is DatabentoCandleRecord => record !== null)
    .sort((left, right) => left.time - right.time);

  const deduped: DatabentoCandleRecord[] = [];
  for (const candle of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.time === candle.time) {
      deduped[deduped.length - 1] = candle;
      continue;
    }
    deduped.push(candle);
  }

  return deduped;
};

const aggregateCandles = (
  candles: DatabentoCandleRecord[],
  timeframe: string
): DatabentoCandleRecord[] => {
  if (candles.length === 0) {
    return [];
  }
  if (timeframe === "M1" || timeframe === "H1" || timeframe === "D") {
    return candles.slice();
  }

  const aggregated: DatabentoCandleRecord[] = [];
  let activeBucket: DatabentoCandleRecord | null = null;

  for (const candle of candles) {
    const bucketTime = floorToTimeframe(candle.time, timeframe);
    if (!isXauTradingTime(bucketTime)) {
      continue;
    }

    if (!activeBucket || activeBucket.time !== bucketTime) {
      if (activeBucket) {
        aggregated.push(activeBucket);
      }

      activeBucket = {
        time: bucketTime,
        pair: DATABENTO_DEFAULT_PAIR,
        timeframe,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      };
      continue;
    }

    activeBucket.high = Math.max(activeBucket.high, candle.high);
    activeBucket.low = Math.min(activeBucket.low, candle.low);
    activeBucket.close = candle.close;
    activeBucket.volume += candle.volume;
  }

  if (activeBucket) {
    aggregated.push(activeBucket);
  }

  return aggregated;
};

const trimCandlesToBounds = (
  candles: DatabentoCandleRecord[],
  count: number,
  start: string | null,
  end: string | null
): DatabentoCandleRecord[] => {
  const startMs = parseTimeMs(start);
  const endMs = parseTimeMs(end);

  const filtered = candles.filter((candle) => {
    if (startMs !== null && candle.time < startMs) {
      return false;
    }
    if (endMs !== null && candle.time >= endMs) {
      return false;
    }
    return true;
  });

  return filtered.length > count ? filtered.slice(-count) : filtered;
};

const fetchDatabentoOhlcvRecords = async (params: {
  schema: string;
  start: string;
  end: string;
}): Promise<DatabentoJsonLine[]> => {
  return databentoGetJsonLines(
    "timeseries.get_range",
    {
      dataset: DATABENTO_DATASET,
      symbols: DATABENTO_DEFAULT_CONTINUOUS_SYMBOL,
      stype_in: "continuous",
      schema: params.schema,
      start: params.start,
      end: params.end,
      encoding: "json",
      compression: "none"
    },
    60_000
  );
};

export const fetchDatabentoCandles = async (params: {
  pair: string;
  timeframe: string;
  count: number;
  start?: string | null;
  end?: string | null;
}): Promise<DatabentoCandlesPayload> => {
  const pair = params.pair.toUpperCase();
  const timeframe = params.timeframe.toUpperCase();
  const count = Math.max(1, Math.trunc(params.count));

  const normalizedStart = await clipToSchemaStart(timeframe, params.start || null);
  const normalizedEnd =
    (await clipToSchemaEnd(timeframe, params.end || null)) || new Date().toISOString();

  const normalizedStartMs = parseTimeMs(normalizedStart);
  const normalizedEndMs = parseTimeMs(normalizedEnd) ?? Date.now();
  if (
    normalizedStartMs !== null &&
    normalizedEndMs !== null &&
    normalizedStartMs >= normalizedEndMs
  ) {
    return {
      pair,
      timeframe,
      start: normalizedStart,
      end: normalizedEnd,
      count: 0,
      candles: [],
      source: "databento-http"
    };
  }

  const schema = getSchemaForTimeframe(timeframe);
  let lookbackMs = estimateLookbackMs(timeframe, count);
  let candles: DatabentoCandleRecord[] = [];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const lookbackStart = new Date(normalizedEndMs - lookbackMs).toISOString();
    const effectiveStart =
      normalizedStart || (await clipToSchemaStart(timeframe, lookbackStart)) || lookbackStart;

    const records = await fetchDatabentoOhlcvRecords({
      schema,
      start: effectiveStart,
      end: normalizedEnd
    });
    const baseCandles = normalizeDatabentoOhlcvRecords(records, timeframe);
    const aggregatedCandles = trimCandlesToBounds(
      aggregateCandles(baseCandles, timeframe),
      count,
      normalizedStart,
      normalizedEnd
    );

    candles = aggregatedCandles;
    if (normalizedStart || candles.length >= count) {
      break;
    }
    lookbackMs *= 2;
  }

  return {
    pair,
    timeframe,
    start: normalizedStart,
    end: normalizedEnd,
    count: candles.length,
    candles,
    source: "databento-http"
  };
};

const extractTopLevelQuote = (
  record: DatabentoJsonLine
): { bid: number | null; ask: number | null } => {
  const levels = Array.isArray(record.levels) ? record.levels : [];
  const levelZero =
    levels.length > 0 && levels[0] && typeof levels[0] === "object"
      ? (levels[0] as Record<string, unknown>)
      : null;

  const bid = toPrice(levelZero?.bid_px ?? record.bid_px_00);
  const ask = toPrice(levelZero?.ask_px ?? record.ask_px_00);

  return {
    bid: Number.isFinite(bid) ? bid : null,
    ask: Number.isFinite(ask) ? ask : null
  };
};

export const fetchDatabentoLatestQuote = async (): Promise<DatabentoQuotePayload | null> => {
  const endIso = new Date().toISOString();
  const startIso = new Date(Date.now() - QUOTE_POLL_LOOKBACK_MS).toISOString();
  const records = await databentoGetJsonLines(
    "timeseries.get_range",
    {
      dataset: DATABENTO_DATASET,
      symbols: DATABENTO_DEFAULT_CONTINUOUS_SYMBOL,
      stype_in: "continuous",
      schema: "bbo-1s",
      start: startIso,
      end: endIso,
      limit: 1,
      encoding: "json",
      compression: "none"
    },
    20_000
  );

  const record = records[records.length - 1];
  if (!record) {
    return null;
  }

  const timeMs = toEpochMs(record.ts_recv ?? record.ts_event);
  if (!Number.isFinite(timeMs)) {
    return null;
  }

  const { bid, ask } = extractTopLevelQuote(record);
  if (bid === null && ask === null) {
    return null;
  }

  const mid =
    bid !== null && ask !== null ? (bid + ask) / 2 : (bid !== null ? bid : ask);

  return {
    pair: DATABENTO_DEFAULT_PAIR,
    continuous_symbol: DATABENTO_DEFAULT_CONTINUOUS_SYMBOL,
    raw_symbol:
      typeof record.stype_out_symbol === "string" && record.stype_out_symbol.length > 0
        ? record.stype_out_symbol
        : null,
    bid,
    ask,
    mid: mid ?? null,
    time: new Date(timeMs).toISOString(),
    source: "databento-bbo-1s"
  };
};
