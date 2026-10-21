#!/usr/bin/env python3
"""Export Yahoo-sourced dividend/split events for explicit review.

This does not modify OHLCV. Events are observations, not issuer-verified facts.
"""
import argparse
import json
import math
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "public" / "data" / "actions"


def serialize_actions(frame):
    if frame is None or frame.empty:
        return []
    result = []
    for timestamp, row in frame.iterrows():
        try:
            date = timestamp.date().isoformat()
        except AttributeError:
            continue
        for column, kind in (("Dividends", "dividend"), ("Stock Splits", "split")):
            value = row.get(column, 0)
            try:
                value = float(value)
            except (ValueError, TypeError):
                continue
            if not math.isfinite(value) or value <= 0:
                continue
            result.append({"date": date, "type": kind, "value": value})
    return sorted(result, key=lambda event: (event["date"], event["type"]))


def write_actions(ticker, events, destination=DEST):
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / f"{ticker}.json"
    payload = {
        "ticker": ticker,
        "source": "Yahoo Finance (yfinance)",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "verifiedByExchange": False,
        "events": events,
    }
    fd, temp = tempfile.mkstemp(dir=destination, prefix=f".{ticker}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, target)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    parser = argparse.ArgumentParser(description="Export Yahoo dividend/split events")
    parser.add_argument("--tickers", nargs="+", required=True, help="Four-letter IDX symbols")
    args = parser.parse_args()
    tickers = sorted(set(t.upper().strip() for t in args.tickers))
    if len(tickers) > 100 or any(len(t) != 4 or not t.isascii() or not t.isalpha() for t in tickers):
        parser.error("Use 1 to 100 four-letter IDX symbols")
    import yfinance as yf
    failed = []
    for ticker in tickers:
        try:
            events = serialize_actions(yf.Ticker(f"{ticker}.JK").actions)
            write_actions(ticker, events)
            print(f"{ticker}: exported {len(events)} provider events")
        except Exception as exc:
            print(f"{ticker}: failed: {exc}", file=sys.stderr)
            failed.append(ticker)
    if failed:
        raise SystemExit(f"Yahoo actions fetch failed for: {', '.join(failed)}")


if __name__ == "__main__":
    main()
