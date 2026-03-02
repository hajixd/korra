import urllib.request
import urllib.parse
import json
import time
import os
from datetime import datetime, timezone, timedelta

API_KEY = "139626f1aaa3426a942e411734ecb8c2"
BASE_URL = "https://api.twelvedata.com/time_series"
SYMBOL = "XAU/USD"
INTERVAL = "1min"
CSV_FILE = "xauusd_1m.csv"
EARLIEST_DATE = "2020-04-06 16:40:00"
OUTPUT_SIZE = 5000
REQUEST_DELAY = 8


def datetime_to_ms(dt_str):
    dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
    dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def subtract_minute(dt_str):
    dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
    dt -= timedelta(minutes=1)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def fetch_batch(end_date_str):
    params = urllib.parse.urlencode({
        "symbol": SYMBOL,
        "interval": INTERVAL,
        "outputsize": OUTPUT_SIZE,
        "end_date": end_date_str,
        "timezone": "UTC",
        "apikey": API_KEY,
        "order": "desc",
    })
    url = f"{BASE_URL}?{params}"

    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            if data.get("code") == 429:
                wait = 60 if attempt < 2 else 120
                print(f"  Rate limited, waiting {wait}s...", flush=True)
                time.sleep(wait)
                continue
            if data.get("status") == "error":
                print(f"  API Error: {data.get('message', data)}", flush=True)
                return None
            return data.get("values", [])
        except Exception as e:
            print(f"  Request error (attempt {attempt+1}): {e}", flush=True)
            time.sleep(10)
    return None


def get_oldest_datetime_from_csv():
    with open(CSV_FILE, "rb") as f:
        f.seek(0, 2)
        size = f.tell()
        pos = size - min(size, 4096)
        f.seek(pos)
        chunk = f.read().decode("utf-8", errors="ignore")
    lines = chunk.strip().split("\n")
    for line in reversed(lines):
        parts = line.strip().split(",")
        if len(parts) >= 6 and parts[1].count("-") == 2:
            return parts[1]
    return None


def main():
    oldest = get_oldest_datetime_from_csv()
    if not oldest:
        print("Could not determine oldest datetime from CSV")
        return

    print(f"Current oldest date in CSV: {oldest}", flush=True)
    print(f"Target earliest date:       {EARLIEST_DATE}", flush=True)
    print(f"Max output per request:     {OUTPUT_SIZE}", flush=True)
    print(f"Delay between requests:     {REQUEST_DELAY}s", flush=True)
    print("-" * 60, flush=True)

    current_end = subtract_minute(oldest)
    batch_num = 0
    total_new_rows = 0
    consecutive_empty = 0

    with open(CSV_FILE, "a") as f:
        while True:
            batch_num += 1
            print(f"Batch {batch_num}: fetching up to {current_end}...", end=" ", flush=True)

            values = fetch_batch(current_end)

            if values is None:
                print("ERROR - stopping", flush=True)
                break

            if len(values) == 0:
                consecutive_empty += 1
                print("empty response", flush=True)
                if consecutive_empty >= 3:
                    print("3 consecutive empty responses - stopping", flush=True)
                    break
                time.sleep(REQUEST_DELAY)
                continue

            consecutive_empty = 0
            batch_rows = 0
            oldest_in_batch = None

            for v in values:
                dt = v["datetime"]
                ts_ms = datetime_to_ms(dt)
                line = f"{ts_ms},{dt},{v['open']},{v['high']},{v['low']},{v['close']}\n"
                f.write(line)
                batch_rows += 1
                oldest_in_batch = dt

            total_new_rows += batch_rows
            f.flush()

            print(f"got {batch_rows} rows -> oldest: {oldest_in_batch} | total new: {total_new_rows}", flush=True)

            if oldest_in_batch and oldest_in_batch <= EARLIEST_DATE:
                print("Reached earliest available data!", flush=True)
                break

            if batch_rows < OUTPUT_SIZE:
                print("Received fewer rows than requested - likely near the beginning of available data", flush=True)

            current_end = subtract_minute(oldest_in_batch)
            time.sleep(REQUEST_DELAY)

    print("=" * 60, flush=True)
    print(f"Done! Added {total_new_rows} new rows to {CSV_FILE}", flush=True)
    total_lines = sum(1 for _ in open(CSV_FILE)) - 1
    print(f"Total data rows in CSV: {total_lines}", flush=True)


if __name__ == "__main__":
    main()
