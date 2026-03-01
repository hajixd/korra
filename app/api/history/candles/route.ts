import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { NextResponse } from "next/server";

const LOCAL_XAU_CSV_PATH = path.join(process.cwd(), "xauusd_1m.csv");
const LOCAL_XAU_PAIR = "XAU_USD";
const DEFAULT_PAIR = LOCAL_XAU_PAIR;
const DEFAULT_TIMEFRAME = "M15";
const DEFAULT_COUNT = 2500;
const MIN_COUNT = 10;
const MAX_COUNT = 60000;
const ALLOWED_TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D", "W", "M"]);

const LOCAL_SOURCE_BARS_PER_CANDLE: Record<string, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D: 1440,
  W: 10080,
  M: 44640
};

type OneMinuteCsvRow = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type HistoryCandle = {
  time: string;
  timestamp: number;
  pair: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const toIsoCursor = (input: string | null) => {
  if (!input) {
    return null;
  }

  const parsed = new Date(input);

  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const isXauTradingTime = (timestamp: number) => {
  const date = new Date(timestamp);
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

const estimateLocalSourceBarsNeeded = (timeframe: string, count: number) => {
  const multiplier = LOCAL_SOURCE_BARS_PER_CANDLE[timeframe] || 1;
  return Math.min(count * multiplier + multiplier, 3_000_000);
};

const floorToBucket = (timestamp: number, timeframe: string) => {
  const date = new Date(timestamp);

  date.setUTCMilliseconds(0);
  date.setUTCSeconds(0);

  switch (timeframe) {
    case "M1":
      return date.getTime();
    case "M5":
    case "M15":
    case "M30": {
      const step = timeframe === "M5" ? 5 : timeframe === "M15" ? 15 : 30;
      date.setUTCMinutes(Math.floor(date.getUTCMinutes() / step) * step);
      return date.getTime();
    }
    case "H1":
      date.setUTCMinutes(0);
      return date.getTime();
    case "H4":
      date.setUTCMinutes(0);
      date.setUTCHours(Math.floor(date.getUTCHours() / 4) * 4);
      return date.getTime();
    case "D":
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    case "W": {
      date.setUTCHours(0, 0, 0, 0);
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - daysSinceMonday);
      return date.getTime();
    }
    case "M":
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(1);
      return date.getTime();
    default:
      return date.getTime();
  }
};

const jsonHistoryResponse = ({
  pair,
  timeframe,
  candles
}: {
  pair: string;
  timeframe: string;
  candles: HistoryCandle[];
}) => {
  return NextResponse.json(
    {
      pair,
      timeframe,
      count: candles.length,
      candles
    },
    {
      headers: {
        "X-Korra-Data-Source": "local-xauusd-csv-history",
        "X-Korra-History-Start": candles[0]?.time ?? "",
        "X-Korra-History-End": candles[candles.length - 1]?.time ?? ""
      }
    }
  );
};

const readLocalOneMinuteRows = async ({
  count,
  cursor
}: {
  count: number;
  cursor: string | null;
}) => {
  if (!fs.existsSync(LOCAL_XAU_CSV_PATH)) {
    return null;
  }

  const beforeMs = cursor ? Date.parse(cursor) : Number.POSITIVE_INFINITY;

  if (cursor && !Number.isFinite(beforeMs)) {
    return [];
  }

  const rows: OneMinuteCsvRow[] = [];
  const input = fs.createReadStream(LOCAL_XAU_CSV_PATH, { encoding: "utf8" });
  const lineReader = readline.createInterface({
    input,
    crlfDelay: Infinity
  });
  let isHeader = true;

  try {
    for await (const rawLine of lineReader) {
      if (isHeader) {
        isHeader = false;
        continue;
      }

      const line = rawLine.trim();

      if (!line) {
        continue;
      }

      const [timestampRaw, , openRaw, highRaw, lowRaw, closeRaw] = line.split(",");
      const timestamp = Number(timestampRaw);

      if (!Number.isFinite(timestamp) || timestamp >= beforeMs || !isXauTradingTime(timestamp)) {
        continue;
      }

      const open = Number(openRaw);
      const high = Number(highRaw);
      const low = Number(lowRaw);
      const close = Number(closeRaw);

      if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        continue;
      }

      rows.push({
        timestamp,
        open,
        high,
        low,
        close
      });

      if (rows.length >= count) {
        break;
      }
    }
  } finally {
    lineReader.close();
    input.destroy();
  }

  return rows;
};

const aggregateLocalRows = ({
  rowsDescending,
  pair,
  timeframe,
  count
}: {
  rowsDescending: OneMinuteCsvRow[];
  pair: string;
  timeframe: string;
  count: number;
}) => {
  const rowsAscending = rowsDescending.slice().reverse();

  if (timeframe === "M1") {
    return rowsAscending
      .map((row) => ({
        time: new Date(row.timestamp).toISOString(),
        timestamp: row.timestamp,
        pair,
        timeframe,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: 0
      }))
      .slice(-count);
  }

  const candles: HistoryCandle[] = [];
  let activeBucket: HistoryCandle | null = null;

  for (const row of rowsAscending) {
    const bucketTime = floorToBucket(row.timestamp, timeframe);

    if (!activeBucket || activeBucket.timestamp !== bucketTime) {
      if (activeBucket) {
        candles.push(activeBucket);
      }

      activeBucket = {
        time: new Date(bucketTime).toISOString(),
        timestamp: bucketTime,
        pair,
        timeframe,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: 0
      };
      continue;
    }

    activeBucket.high = Math.max(activeBucket.high, row.high);
    activeBucket.low = Math.min(activeBucket.low, row.low);
    activeBucket.close = row.close;
  }

  if (activeBucket) {
    candles.push(activeBucket);
  }

  return candles.slice(-count);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || DEFAULT_TIMEFRAME).toUpperCase();
  const countRaw = searchParams.get("count") || String(DEFAULT_COUNT);
  const count = Math.min(
    Math.max(parseInt(countRaw, 10) || DEFAULT_COUNT, MIN_COUNT),
    MAX_COUNT
  );
  const cursorRaw =
    searchParams.get("before") || searchParams.get("end") || searchParams.get("to");
  const cursor = cursorRaw ? toIsoCursor(cursorRaw) : null;

  if (pair !== LOCAL_XAU_PAIR) {
    return NextResponse.json(
      { error: "Only XAU_USD is available while local CSV mode is enabled." },
      { status: 400 }
    );
  }

  if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  if (cursorRaw && !cursor) {
    return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
  }

  if (!fs.existsSync(LOCAL_XAU_CSV_PATH)) {
    return NextResponse.json(
      { error: "Missing local history file: xauusd_1m.csv" },
      { status: 500 }
    );
  }

  const rows = await readLocalOneMinuteRows({
    count: estimateLocalSourceBarsNeeded(timeframe, count),
    cursor
  });

  if (!rows || rows.length === 0) {
    return NextResponse.json(
      {
        pair,
        timeframe,
        count: 0,
        candles: []
      },
      {
        headers: {
          "X-Korra-Data-Source": "local-xauusd-csv-history"
        }
      }
    );
  }

  const candles = aggregateLocalRows({
    rowsDescending: rows,
    pair,
    timeframe,
    count
  });

  return jsonHistoryResponse({
    pair,
    timeframe,
    candles
  });
}
