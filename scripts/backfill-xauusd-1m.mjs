import fs from "node:fs";
import path from "node:path";

const API_BASE_URL = "https://api.twelvedata.com";
const SYMBOL = "XAU/USD";
const INTERVAL = "1min";
const BATCH_SIZE = 5000;
const OUTPUT_PATH = path.join(process.cwd(), "xauusd_1m.csv");

const padTwoDigits = (value) => {
  return String(value).padStart(2, "0");
};

const toTwelveDateTime = (input) => {
  const value = new Date(input);

  if (!Number.isFinite(value.getTime())) {
    return null;
  }

  return [
    `${value.getUTCFullYear()}-${padTwoDigits(value.getUTCMonth() + 1)}-${padTwoDigits(value.getUTCDate())}`,
    `${padTwoDigits(value.getUTCHours())}:${padTwoDigits(value.getUTCMinutes())}:${padTwoDigits(value.getUTCSeconds())}`
  ].join(" ");
};

const parseTimestamp = (input) => {
  if (!input) {
    return Number.NaN;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(input)) {
    return Date.parse(`${input.replace(" ", "T")}Z`);
  }

  return Date.parse(input);
};

const isXauTradingTime = (timestamp) => {
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

const readLastNonEmptyLine = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stats = fs.statSync(filePath);

  if (stats.size === 0) {
    return null;
  }

  const fd = fs.openSync(filePath, "r");
  let position = stats.size;
  let buffer = "";

  try {
    while (position > 0) {
      const chunkSize = Math.min(64 * 1024, position);
      const chunk = Buffer.alloc(chunkSize);

      position -= chunkSize;
      fs.readSync(fd, chunk, 0, chunkSize, position);
      buffer = chunk.toString("utf8") + buffer;

      const lines = buffer.split(/\r?\n/).filter(Boolean);

      if (lines.length > 1 || position === 0) {
        return lines[lines.length - 1] || null;
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  return null;
};

const loadApiKey = () => {
  if (process.env.TWELVE_DATA_API_KEY) {
    return process.env.TWELVE_DATA_API_KEY;
  }

  const envPath = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(envPath)) {
    return null;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "TWELVE_DATA_API_KEY" || key === "TWELVEDATA_API_KEY") {
      return value;
    }
  }

  return null;
};

const requestJson = async (pathname, params, attempt = 1) => {
  const url = new URL(`${API_BASE_URL}${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    cache: "no-store"
  });
  const payload = await response.json();

  if (response.ok && payload.status !== "error") {
    return payload;
  }

  const shouldRetry = response.status >= 429 || payload.code === 429;

  if (shouldRetry && attempt < 6) {
    const delayMs = attempt * 5000;

    console.log(`Retrying after ${delayMs}ms due to rate limit or transient error...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    return requestJson(pathname, params, attempt + 1);
  }

  throw new Error(payload.message || `Request failed with status ${response.status}`);
};

const fetchEarliest = async (apiKey) => {
  const payload = await requestJson("/earliest_timestamp", {
    symbol: SYMBOL,
    interval: INTERVAL,
    apikey: apiKey
  });
  const timestamp = parseTimestamp(payload.datetime);

  if (!Number.isFinite(timestamp)) {
    throw new Error("Unable to determine earliest XAU/USD 1-minute timestamp.");
  }

  return {
    datetime: payload.datetime,
    timestamp
  };
};

const run = async () => {
  const apiKey = loadApiKey();

  if (!apiKey) {
    throw new Error("Missing TWELVE_DATA_API_KEY in environment or .env.local.");
  }

  const earliest = await fetchEarliest(apiKey);
  const lastLine = readLastNonEmptyLine(OUTPUT_PATH);
  const [lastTimestampRaw] = lastLine ? lastLine.split(",") : [];
  const lastTimestamp = Number(lastTimestampRaw);
  const isResumeFile =
    lastLine !== null &&
    lastLine !== "timestamp,datetime,open,high,low,close" &&
    Number.isFinite(lastTimestamp);
  const stream = fs.createWriteStream(OUTPUT_PATH, {
    encoding: "utf8",
    flags: isResumeFile ? "a" : "w"
  });
  let endDate = isResumeFile ? toTwelveDateTime(new Date(lastTimestamp - 60_000)) : null;
  let totalRows = 0;
  let page = 0;

  if (!isResumeFile) {
    stream.write("timestamp,datetime,open,high,low,close\n");
  }

  console.log(`Writing ${OUTPUT_PATH}`);
  console.log(`Earliest available 1-minute bar: ${earliest.datetime} UTC`);

  if (isResumeFile) {
    console.log(`Resuming from ${new Date(lastTimestamp).toISOString()}`);
  }

  try {
    while (true) {
      if (isResumeFile && Number.isFinite(lastTimestamp) && lastTimestamp <= earliest.timestamp) {
        break;
      }

      const payload = await requestJson("/time_series", {
        symbol: SYMBOL,
        interval: INTERVAL,
        outputsize: BATCH_SIZE,
        order: "desc",
        timezone: "UTC",
        apikey: apiKey,
        end_date: endDate
      });
      const values = Array.isArray(payload.values) ? payload.values : [];

      if (values.length === 0) {
        break;
      }

      for (const value of values) {
        const timestamp = parseTimestamp(value.datetime);

        if (!Number.isFinite(timestamp) || !isXauTradingTime(timestamp)) {
          continue;
        }

        stream.write(
          `${timestamp},${value.datetime},${value.open},${value.high},${value.low},${value.close}\n`
        );
      }

      totalRows += values.length;
      page += 1;

      const oldest = values[values.length - 1];
      const oldestTimestamp = parseTimestamp(oldest?.datetime);

      if (!Number.isFinite(oldestTimestamp)) {
        break;
      }

      if (page === 1 || page % 10 === 0 || oldestTimestamp <= earliest.timestamp) {
        console.log(
          `Page ${page}: wrote ${values.length} rows, total ${totalRows}, oldest ${oldest.datetime} UTC`
        );
      }

      if (oldestTimestamp <= earliest.timestamp || values.length < BATCH_SIZE) {
        break;
      }

      endDate = toTwelveDateTime(new Date(oldestTimestamp - 60_000));

      if (!endDate) {
        break;
      }
    }
  } finally {
    await new Promise((resolve, reject) => {
      stream.end((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  console.log(`Finished. Wrote ${totalRows} rows to ${OUTPUT_PATH}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
