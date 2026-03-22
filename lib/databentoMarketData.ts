import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

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

const DATABENTO_SCRIPT_PATH = path.join(process.cwd(), "scripts", "databento_gold.py");
const DATABENTO_PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const RANGE_CACHE_TTL_MS = 60_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

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

let cachedRange: { expiresAt: number; value: DatasetRange } | null = null;

const parseTimeMs = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getSchemaForTimeframe = (timeframe: string): string => {
  return BASE_SCHEMA_BY_TIMEFRAME[timeframe] || "ohlcv-1m";
};

const runDatabentoJsonCommand = async <T>(
  args: string[],
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS
): Promise<T> => {
  const child = spawn(DATABENTO_PYTHON_BIN, [DATABENTO_SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    env: process.env
  });

  let stdout = "";
  let stderr = "";
  let settled = false;

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new Error(`Databento command timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);

      if (code !== 0) {
        reject(new Error((stderr || stdout || `Databento command failed (${code}).`).trim()));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()) as T);
      } catch (error) {
        reject(
          new Error(
            `Failed to parse Databento output: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });
  });
};

const getDatasetRange = async (): Promise<DatasetRange> => {
  const now = Date.now();
  if (cachedRange && cachedRange.expiresAt > now) {
    return cachedRange.value;
  }

  const value = await runDatabentoJsonCommand<DatasetRange>(["range"], 15_000);
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

export const buildEmptyDatabentoCandlesPayload = (params: {
  pair: string;
  timeframe: string;
  count: number;
  start: string | null;
  end: string | null;
  details: string;
}) => {
  const { pair, timeframe, count, start, end, details } = params;
  return {
    pair,
    timeframe,
    start,
    end,
    count: 0,
    requestedCount: count,
    candles: [],
    source: "databento-fallback",
    error: details
  };
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
  const normalizedEnd = await clipToSchemaEnd(timeframe, params.end || null);

  const normalizedStartMs = parseTimeMs(normalizedStart);
  const normalizedEndMs = parseTimeMs(normalizedEnd);
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
      source: "databento"
    };
  }

  const args = [
    "candles",
    "--pair",
    pair,
    "--symbol",
    DATABENTO_DEFAULT_CONTINUOUS_SYMBOL,
    "--timeframe",
    timeframe,
    "--count",
    String(count)
  ];
  if (normalizedStart) {
    args.push("--start", normalizedStart);
  }
  if (normalizedEnd) {
    args.push("--end", normalizedEnd);
  }

  const payload = await runDatabentoJsonCommand<DatabentoCandlesPayload>(args, 60_000);
  return {
    ...payload,
    pair,
    timeframe,
    start: normalizedStart ?? payload.start ?? null,
    end: normalizedEnd ?? payload.end ?? null
  };
};

export const spawnDatabentoStreamProcess = (): ChildProcessWithoutNullStreams => {
  return spawn(
    DATABENTO_PYTHON_BIN,
    [
      DATABENTO_SCRIPT_PATH,
      "stream",
      "--pair",
      DATABENTO_DEFAULT_PAIR,
      "--symbol",
      DATABENTO_DEFAULT_CONTINUOUS_SYMBOL
    ],
    {
      cwd: process.cwd(),
      env: process.env
    }
  );
};
