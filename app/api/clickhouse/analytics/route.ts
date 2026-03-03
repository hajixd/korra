import { NextResponse } from "next/server";

const TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D", "W", "M"]);
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_PAIR = "XAU_USD";
const DEFAULT_TABLE = "candles";
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PAIR_RE = /^[A-Z0-9]{2,20}_[A-Z0-9]{2,20}$/;
const TIMEZONE_RE = /^[A-Za-z0-9_/\-+]+$/;

const toClickhouseDateTime = (input: string | null) => {
  if (!input) return null;
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace("T", " ");
};

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeMetric = (value: string | null): "monthly_avg_price" | "monthly_volume" | "monthly_price_and_volume" => {
  const normalized = String(value || "monthly_avg_price").trim().toLowerCase();
  if (normalized === "monthly_volume") return "monthly_volume";
  if (normalized === "monthly_price_and_volume") return "monthly_price_and_volume";
  return "monthly_avg_price";
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = (searchParams.get("pair") || DEFAULT_PAIR).toUpperCase();
  const timeframe = (searchParams.get("timeframe") || "M15").toUpperCase();
  const metric = normalizeMetric(searchParams.get("metric"));

  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
  const start = toClickhouseDateTime(searchParams.get("start") || defaultStart.toISOString());
  const end = toClickhouseDateTime(searchParams.get("end"));

  if (!PAIR_RE.test(pair)) {
    return NextResponse.json({ error: "Unsupported pair format" }, { status: 400 });
  }

  if (!TIMEFRAMES.has(timeframe)) {
    return NextResponse.json({ error: "Unsupported timeframe" }, { status: 400 });
  }

  const host = process.env.CLICKHOUSE_HOST;
  const user = process.env.CLICKHOUSE_USER;
  const password = process.env.CLICKHOUSE_PASSWORD;
  const database = process.env.CLICKHOUSE_DATABASE || "default";
  const table = process.env.CLICKHOUSE_TABLE || DEFAULT_TABLE;
  const timezone = process.env.CLICKHOUSE_TIMEZONE || DEFAULT_TIMEZONE;

  if (!host || !user || !password) {
    return NextResponse.json(
      { error: "Missing ClickHouse connection env vars." },
      { status: 500 }
    );
  }

  if (!IDENTIFIER_RE.test(database) || !IDENTIFIER_RE.test(table)) {
    return NextResponse.json(
      { error: "Invalid ClickHouse database/table name in env vars." },
      { status: 500 }
    );
  }

  if (!TIMEZONE_RE.test(timezone)) {
    return NextResponse.json(
      { error: "Invalid ClickHouse timezone in env vars." },
      { status: 500 }
    );
  }

  const startFilter = start
    ? `\n      AND time >= toDateTime('${start}', '${timezone}')`
    : "";
  const endFilter = end
    ? `\n      AND time <= toDateTime('${end}', '${timezone}')`
    : "";

  const selectMetric =
    metric === "monthly_volume"
      ? "sum(toFloat64(volume)) AS metric_value"
      : metric === "monthly_price_and_volume"
        ? "avg(toFloat64(close)) AS metric_value, sum(toFloat64(volume)) AS volume_total"
        : "avg(toFloat64(close)) AS metric_value";

  const query = `
    SELECT
      formatDateTime(toStartOfMonth(toTimeZone(time, '${timezone}')), '%Y-%m') AS month,
      ${selectMetric},
      avg(toFloat64(high) - toFloat64(low)) AS avg_range,
      sum(toFloat64(volume)) AS total_volume,
      count() AS count
    FROM ${database}.${table}
    WHERE pair = '${pair}'
      AND timeframe = '${timeframe}'
${startFilter}${endFilter}
    GROUP BY month
    ORDER BY month ASC
    FORMAT JSON
  `;

  try {
    const normalizedHost = host.replace(/\/+$/, "");
    const response = await fetch(`${normalizedHost}/`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
      },
      body: query,
      cache: "no-store"
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `ClickHouse error ${response.status}: ${text}` },
        { status: response.status }
      );
    }

    const payload = await response.json();
    const rows = ((payload.data || []) as Array<Record<string, unknown>>).map((row) => ({
      month: String(row.month || ""),
      metric_value: toNumber(row.metric_value),
      avg_range: toNumber(row.avg_range),
      total_volume: toNumber(row.total_volume),
      count: toNumber(row.count)
    }));

    return NextResponse.json({
      pair,
      timeframe,
      metric,
      start: start || null,
      end: end || null,
      count: rows.length,
      rows
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unknown error" },
      { status: 500 }
    );
  }
}
