import argparse
import datetime as dt
import json
import math
import os
import signal
import sys
import warnings

import pandas as pd

import databento as db

try:
    from databento.common.error import BentoWarning
except Exception:  # pragma: no cover
    BentoWarning = Warning


warnings.simplefilter("ignore", category=BentoWarning)

DATASET = "GLBX.MDP3"
DEFAULT_PAIR = "XAU_USD"
DEFAULT_SYMBOL = os.environ.get("DATABENTO_GOLD_CONTINUOUS_SYMBOL", "GC.v.0")

SUPPORTED_TIMEFRAMES = {"M1", "M5", "M15", "M30", "H1", "H4", "D", "W", "M"}
BASE_SCHEMA_BY_TIMEFRAME = {
    "M1": "ohlcv-1m",
    "M5": "ohlcv-1m",
    "M15": "ohlcv-1m",
    "M30": "ohlcv-1m",
    "H1": "ohlcv-1h",
    "H4": "ohlcv-1h",
    "D": "ohlcv-1d",
    "W": "ohlcv-1d",
    "M": "ohlcv-1d",
}
TIMEFRAME_SECONDS = {
    "M1": 60,
    "M5": 5 * 60,
    "M15": 15 * 60,
    "M30": 30 * 60,
    "H1": 60 * 60,
    "H4": 4 * 60 * 60,
    "D": 24 * 60 * 60,
    "W": 7 * 24 * 60 * 60,
    "M": 31 * 24 * 60 * 60,
}
LOOKBACK_FACTOR = {
    "M1": 1.85,
    "M5": 1.85,
    "M15": 1.85,
    "M30": 1.85,
    "H1": 1.85,
    "H4": 1.85,
    "D": 1.55,
    "W": 1.35,
    "M": 1.35,
}
MIN_LOOKBACK = {
    "M1": dt.timedelta(days=5),
    "M5": dt.timedelta(days=5),
    "M15": dt.timedelta(days=5),
    "M30": dt.timedelta(days=5),
    "H1": dt.timedelta(days=7),
    "H4": dt.timedelta(days=14),
    "D": dt.timedelta(days=45),
    "W": dt.timedelta(days=400),
    "M": dt.timedelta(days=1800),
}


def eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def load_api_key() -> str:
    key = (os.environ.get("DATABENTO_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("Missing DATABENTO_API_KEY.")
    return key


def normalize_timeframe(value: str) -> str:
    normalized = str(value or "").strip().upper()
    if normalized not in SUPPORTED_TIMEFRAMES:
        raise ValueError(f"Unsupported timeframe: {value}")
    return normalized


def parse_timestamp(value: str | None) -> pd.Timestamp | None:
    if not value:
        return None

    parsed = pd.Timestamp(value)
    if parsed.tzinfo is None:
        return parsed.tz_localize("UTC")
    return parsed.tz_convert("UTC")


def estimate_lookback(timeframe: str, count: int) -> dt.timedelta:
    padded_count = max(64, count + 32)
    seconds = TIMEFRAME_SECONDS[timeframe] * padded_count * LOOKBACK_FACTOR[timeframe]
    return max(MIN_LOOKBACK[timeframe], dt.timedelta(seconds=max(60, math.ceil(seconds))))


def compute_bucket_start(series: pd.Series, timeframe: str) -> pd.Series:
    timestamps = pd.to_datetime(series, utc=True)

    if timeframe in {"M1", "M5", "M15", "M30", "H1", "H4", "D"}:
        bucket_seconds = TIMEFRAME_SECONDS[timeframe]
        bucket_ns = bucket_seconds * 1_000_000_000
        ns = timestamps.astype("int64", copy=False)
        return pd.to_datetime((ns // bucket_ns) * bucket_ns, utc=True)

    if timeframe == "W":
        day_floor = timestamps.dt.floor("D")
        return day_floor - pd.to_timedelta(timestamps.dt.weekday, unit="D")

    if timeframe == "M":
        return pd.to_datetime(
            {
                "year": timestamps.dt.year,
                "month": timestamps.dt.month,
                "day": 1,
            },
            utc=True,
        )

    raise ValueError(f"Unsupported timeframe: {timeframe}")


def aggregate_candles(
    frame: pd.DataFrame,
    timeframe: str,
    start_bound: pd.Timestamp | None,
    end_bound: pd.Timestamp | None,
    count: int,
) -> list[dict[str, object]]:
    if frame.empty:
        return []

    working = frame.reset_index()
    time_column = "ts_event" if "ts_event" in working.columns else working.columns[0]
    working[time_column] = pd.to_datetime(working[time_column], utc=True)
    working = working.sort_values(time_column)
    working["bucket_start"] = compute_bucket_start(working[time_column], timeframe)

    aggregated = (
        working.groupby("bucket_start", sort=True, as_index=False)
        .agg(
            open=("open", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            volume=("volume", "sum"),
        )
        .sort_values("bucket_start")
    )

    if start_bound is not None:
        aggregated = aggregated[aggregated["bucket_start"] >= start_bound]
    if end_bound is not None:
        aggregated = aggregated[aggregated["bucket_start"] < end_bound]

    if count > 0 and len(aggregated.index) > count:
        aggregated = aggregated.tail(count)

    rows: list[dict[str, object]] = []
    for row in aggregated.itertuples(index=False):
        bucket_start = pd.Timestamp(row.bucket_start).tz_convert("UTC")
        rows.append(
            {
                "time": int(bucket_start.value // 1_000_000),
                "pair": DEFAULT_PAIR,
                "timeframe": timeframe,
                "open": float(row.open),
                "high": float(row.high),
                "low": float(row.low),
                "close": float(row.close),
                "volume": float(row.volume),
            }
        )

    return rows


def get_historical_client() -> db.Historical:
    return db.Historical(load_api_key())


def run_range_command() -> int:
    client = get_historical_client()
    payload = client.metadata.get_dataset_range(DATASET)
    print(json.dumps(payload, separators=(",", ":")))
    return 0


def run_candles_command(args: argparse.Namespace) -> int:
    timeframe = normalize_timeframe(args.timeframe)
    count = max(1, int(args.count))
    requested_start = parse_timestamp(args.start)
    requested_end = parse_timestamp(args.end)

    effective_end = requested_end or pd.Timestamp.now(tz="UTC")
    if requested_start is not None and requested_start >= effective_end:
        payload = {
            "pair": DEFAULT_PAIR,
            "timeframe": timeframe,
            "start": args.start or None,
            "end": args.end or None,
            "count": 0,
            "candles": [],
            "source": "databento",
        }
        print(json.dumps(payload, separators=(",", ":")))
        return 0

    client = get_historical_client()
    lookback = estimate_lookback(timeframe, count)
    candles: list[dict[str, object]] = []

    for _attempt in range(4):
        effective_start = requested_start or (effective_end - lookback)
        frame = client.timeseries.get_range(
            dataset=DATASET,
            symbols=[args.symbol],
            stype_in="continuous",
            schema=BASE_SCHEMA_BY_TIMEFRAME[timeframe],
            start=effective_start.isoformat(),
            end=effective_end.isoformat(),
        ).to_df()

        candles = aggregate_candles(
            frame=frame,
            timeframe=timeframe,
            start_bound=requested_start,
            end_bound=requested_end,
            count=count,
        )
        if requested_start is not None or len(candles) >= count:
            break
        lookback *= 2

    payload = {
        "pair": DEFAULT_PAIR,
        "timeframe": timeframe,
        "start": args.start or None,
        "end": args.end or None,
        "count": len(candles),
        "candles": candles,
        "source": "databento",
    }
    print(json.dumps(payload, separators=(",", ":")))
    return 0


def ns_to_iso8601(ts_ns: int) -> str:
    seconds, remainder = divmod(int(ts_ns), 1_000_000_000)
    value = dt.datetime.fromtimestamp(seconds, tz=dt.timezone.utc).replace(
        microsecond=remainder // 1_000
    )
    return value.isoformat().replace("+00:00", "Z")


def coerce_positive_float(value: object) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric) or numeric <= 0:
        return None
    return numeric


def run_stream_command(args: argparse.Namespace) -> int:
    client = db.Live(load_api_key())
    quote_state = {
        "bid": None,
        "ask": None,
        "raw_symbol": None,
    }

    def handle_signal(_signum: int, _frame: object) -> None:
        try:
            client.stop()
        except Exception:
            try:
                client.terminate()
            except Exception:
                pass

    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_signal)

    def on_record(record: object) -> None:
        raw_symbol = getattr(record, "stype_out_symbol", None)
        if isinstance(raw_symbol, str) and raw_symbol:
            quote_state["raw_symbol"] = raw_symbol

        bid = coerce_positive_float(getattr(record, "bid_px_00", None))
        ask = coerce_positive_float(getattr(record, "ask_px_00", None))

        if bid is not None:
            quote_state["bid"] = bid
        if ask is not None:
            quote_state["ask"] = ask

        ts_event = getattr(record, "ts_event", None)
        if ts_event is None:
            return

        has_bid = quote_state["bid"] is not None
        has_ask = quote_state["ask"] is not None
        if not has_bid and not has_ask:
            return

        mid = (
            (quote_state["bid"] + quote_state["ask"]) / 2
            if has_bid and has_ask
            else (quote_state["bid"] if has_bid else quote_state["ask"])
        )
        payload = {
            "pair": DEFAULT_PAIR,
            "continuous_symbol": args.symbol,
            "raw_symbol": quote_state["raw_symbol"],
            "bid": quote_state["bid"],
            "ask": quote_state["ask"],
            "mid": mid,
            "time": ns_to_iso8601(int(ts_event)),
        }
        sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
        sys.stdout.flush()

    client.add_callback(on_record)
    client.subscribe(
        dataset=DATASET,
        schema="mbp-1",
        symbols=args.symbol,
        stype_in="continuous",
    )
    client.start()
    client.block_for_close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Databento gold futures market-data bridge.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("range", help="Fetch dataset availability range.")

    candles_parser = subparsers.add_parser("candles", help="Fetch normalized candles.")
    candles_parser.add_argument("--pair", default=DEFAULT_PAIR)
    candles_parser.add_argument("--symbol", default=DEFAULT_SYMBOL)
    candles_parser.add_argument("--timeframe", required=True)
    candles_parser.add_argument("--count", required=True, type=int)
    candles_parser.add_argument("--start")
    candles_parser.add_argument("--end")

    stream_parser = subparsers.add_parser("stream", help="Stream live quotes as JSON lines.")
    stream_parser.add_argument("--pair", default=DEFAULT_PAIR)
    stream_parser.add_argument("--symbol", default=DEFAULT_SYMBOL)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "range":
            return run_range_command()
        if args.command == "candles":
            return run_candles_command(args)
        if args.command == "stream":
            return run_stream_command(args)
        raise ValueError(f"Unsupported command: {args.command}")
    except Exception as error:
        eprint(error if isinstance(error, str) else str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
