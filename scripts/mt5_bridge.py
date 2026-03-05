#!/usr/bin/env python3
import argparse
import json
import os
import sys
from typing import Any, Dict


def print_json(payload: Dict[str, Any], exit_code: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()
    raise SystemExit(exit_code)


try:
    import MetaTrader5 as mt5  # type: ignore
except Exception as exc:  # pragma: no cover
    print_json({"ok": False, "error": f"MetaTrader5 module unavailable: {exc}"}, 2)


def normalize_login(login: str) -> int:
    try:
        return int(str(login).strip())
    except Exception:
        print_json({"ok": False, "error": "MT5 login must be numeric."}, 2)


def mt5_initialize() -> None:
    terminal_path = os.environ.get("MT5_TERMINAL_PATH", "").strip()
    initialized = mt5.initialize(path=terminal_path) if terminal_path else mt5.initialize()
    if not initialized:
        error = mt5.last_error()
        print_json(
            {
                "ok": False,
                "error": f"MT5 initialize failed: {error}",
            },
            2,
        )


def mt5_login(login: int, password: str, server: str) -> None:
    authorized = mt5.login(login=login, password=password, server=server)
    if not authorized:
        error = mt5.last_error()
        print_json(
            {
                "ok": False,
                "error": f"MT5 login failed: {error}",
            },
            2,
        )


def ensure_symbol(symbol: str) -> None:
    symbol_info = mt5.symbol_info(symbol)
    if symbol_info is None:
        print_json({"ok": False, "error": f"Symbol not found: {symbol}"}, 2)

    if not symbol_info.visible:
        if not mt5.symbol_select(symbol, True):
            error = mt5.last_error()
            print_json(
                {
                    "ok": False,
                    "error": f"Failed to select symbol {symbol}: {error}",
                },
                2,
            )


def get_filling_type(symbol: str) -> int:
    symbol_info = mt5.symbol_info(symbol)
    if symbol_info is None:
        return mt5.ORDER_FILLING_IOC

    mode = int(getattr(symbol_info, "filling_mode", mt5.ORDER_FILLING_IOC))
    if mode in (mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_RETURN):
        return mode
    return mt5.ORDER_FILLING_IOC


def handle_health(args: argparse.Namespace) -> None:
    login = normalize_login(args.login)
    mt5_initialize()
    try:
        mt5_login(login, args.password, args.server)
        account_info = mt5.account_info()
        payload = {
            "ok": True,
            "data": {
                "login": int(account_info.login) if account_info else login,
                "server": str(account_info.server) if account_info else args.server,
                "balance": float(account_info.balance) if account_info else None,
            },
        }
        print_json(payload, 0)
    finally:
        mt5.shutdown()


def handle_open(args: argparse.Namespace) -> None:
    login = normalize_login(args.login)
    side = str(args.side).upper().strip()
    if side not in ("BUY", "SELL"):
        print_json({"ok": False, "error": "--side must be BUY or SELL."}, 2)

    volume = float(args.volume)
    if volume <= 0:
        print_json({"ok": False, "error": "--volume must be > 0."}, 2)

    symbol = str(args.symbol).upper().strip()
    if not symbol:
        print_json({"ok": False, "error": "--symbol is required."}, 2)

    mt5_initialize()
    try:
        mt5_login(login, args.password, args.server)
        ensure_symbol(symbol)

        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            print_json({"ok": False, "error": f"No market tick for symbol {symbol}."}, 2)

        order_type = mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL
        price = float(tick.ask if side == "BUY" else tick.bid)
        if price <= 0:
            print_json({"ok": False, "error": f"Invalid price for {symbol}."}, 2)

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "deviation": int(args.deviation),
            "magic": int(args.magic),
            "comment": str(args.comment or "Korra copy-trade")[:31],
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": get_filling_type(symbol),
        }

        if args.sl is not None and float(args.sl) > 0:
            request["sl"] = float(args.sl)
        if args.tp is not None and float(args.tp) > 0:
            request["tp"] = float(args.tp)

        result = mt5.order_send(request)
        if result is None:
            error = mt5.last_error()
            print_json({"ok": False, "error": f"order_send returned None: {error}"}, 2)

        retcode = int(getattr(result, "retcode", 0))
        allowed = {
            int(getattr(mt5, "TRADE_RETCODE_DONE", 10009)),
            int(getattr(mt5, "TRADE_RETCODE_PLACED", 10008)),
        }
        if retcode not in allowed:
            comment = str(getattr(result, "comment", "Unknown error"))
            print_json(
                {
                    "ok": False,
                    "error": f"Open order rejected ({retcode}): {comment}",
                    "data": {
                        "retcode": retcode,
                        "comment": comment,
                    },
                },
                2,
            )

        position_ticket = int(getattr(result, "order", 0) or getattr(result, "deal", 0) or 0)
        if position_ticket <= 0:
            position_ticket = int(getattr(result, "position", 0) or 0)

        print_json(
            {
                "ok": True,
                "data": {
                    "position_ticket": position_ticket,
                    "price": float(price),
                    "retcode": retcode,
                },
            },
            0,
        )
    finally:
        mt5.shutdown()


def handle_close(args: argparse.Namespace) -> None:
    login = normalize_login(args.login)
    symbol = str(args.symbol).upper().strip()
    if not symbol:
        print_json({"ok": False, "error": "--symbol is required."}, 2)

    try:
        position_ticket = int(args.position_ticket)
    except Exception:
        print_json({"ok": False, "error": "--position-ticket must be numeric."}, 2)

    mt5_initialize()
    try:
        mt5_login(login, args.password, args.server)
        ensure_symbol(symbol)

        positions = mt5.positions_get(ticket=position_ticket)
        if not positions:
            print_json(
                {
                    "ok": True,
                    "data": {
                        "position_ticket": position_ticket,
                        "already_closed": True,
                    },
                },
                0,
            )

        position = positions[0]
        position_type = int(getattr(position, "type", mt5.POSITION_TYPE_BUY))
        volume = float(getattr(position, "volume", 0))
        if volume <= 0:
            print_json({"ok": False, "error": "Position has invalid volume."}, 2)

        close_type = mt5.ORDER_TYPE_SELL if position_type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            print_json({"ok": False, "error": f"No market tick for symbol {symbol}."}, 2)

        price = float(tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask)

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": close_type,
            "position": position_ticket,
            "price": price,
            "deviation": int(args.deviation),
            "magic": int(args.magic),
            "comment": str(args.comment or "Korra close")[:31],
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": get_filling_type(symbol),
        }

        result = mt5.order_send(request)
        if result is None:
            error = mt5.last_error()
            print_json({"ok": False, "error": f"order_send returned None: {error}"}, 2)

        retcode = int(getattr(result, "retcode", 0))
        allowed = {
            int(getattr(mt5, "TRADE_RETCODE_DONE", 10009)),
            int(getattr(mt5, "TRADE_RETCODE_PLACED", 10008)),
        }
        if retcode not in allowed:
            comment = str(getattr(result, "comment", "Unknown error"))
            print_json(
                {
                    "ok": False,
                    "error": f"Close order rejected ({retcode}): {comment}",
                    "data": {
                        "retcode": retcode,
                        "comment": comment,
                    },
                },
                2,
            )

        print_json(
            {
                "ok": True,
                "data": {
                    "position_ticket": position_ticket,
                    "retcode": retcode,
                    "price": price,
                },
            },
            0,
        )
    finally:
        mt5.shutdown()


def add_common_credentials(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--login", required=True, help="MT5 account login (numeric)")
    parser.add_argument("--password", required=True, help="MT5 account password")
    parser.add_argument("--server", required=True, help="MT5 broker server")


def main() -> None:
    parser = argparse.ArgumentParser(description="MT5 bridge for copy trading")
    subparsers = parser.add_subparsers(dest="command", required=True)

    health = subparsers.add_parser("health", help="Check MT5 credentials")
    add_common_credentials(health)

    open_parser = subparsers.add_parser("open", help="Open market position")
    add_common_credentials(open_parser)
    open_parser.add_argument("--symbol", required=True, help="MT5 symbol (e.g., XAUUSD)")
    open_parser.add_argument("--side", required=True, help="BUY or SELL")
    open_parser.add_argument("--volume", required=True, type=float, help="Order volume (lots)")
    open_parser.add_argument("--sl", type=float, default=None, help="Stop loss price")
    open_parser.add_argument("--tp", type=float, default=None, help="Take profit price")
    open_parser.add_argument("--deviation", type=int, default=20, help="Max slippage points")
    open_parser.add_argument("--magic", type=int, default=4442026, help="Magic number")
    open_parser.add_argument("--comment", default="Korra copy-trade", help="Order comment")

    close_parser = subparsers.add_parser("close", help="Close existing position by ticket")
    add_common_credentials(close_parser)
    close_parser.add_argument("--symbol", required=True, help="MT5 symbol (e.g., XAUUSD)")
    close_parser.add_argument("--position-ticket", required=True, help="Position ticket")
    close_parser.add_argument("--deviation", type=int, default=20, help="Max slippage points")
    close_parser.add_argument("--magic", type=int, default=4442026, help="Magic number")
    close_parser.add_argument("--comment", default="Korra close", help="Order comment")

    args = parser.parse_args()

    if args.command == "health":
      handle_health(args)
    elif args.command == "open":
      handle_open(args)
    elif args.command == "close":
      handle_close(args)
    else:
      print_json({"ok": False, "error": "Unknown command."}, 2)


if __name__ == "__main__":
    main()
