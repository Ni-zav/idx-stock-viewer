"""Shared OHLCV integrity rules and crash-safe per-ticker CSV upserts.

Source prices are unadjusted Yahoo Finance observations. Validation does not
establish accuracy relative to an exchange feed; it rejects malformed records.
"""
import csv
import math
import os
import tempfile
from datetime import date, datetime
from pathlib import Path

COLUMNS = ["Date", "Ticker", "Open", "High", "Low", "Close", "Adj Close", "Volume"]


def valid_market_row(row):
    try:
        stamp = str(row["Date"]).strip()
        if len(stamp) == 10:
            date.fromisoformat(stamp)
        else:
            datetime.fromisoformat(stamp.replace(" ", "T").removesuffix("Z"))
        ticker = str(row["Ticker"]).strip().upper()
        if len(ticker) != 4 or not ticker.isascii() or not ticker.isalpha():
            return False
        prices = [float(row[k]) for k in ("Open", "High", "Low", "Close")]
        adjusted = float(row["Adj Close"])
        volume = float(row["Volume"])
        if not all(math.isfinite(x) for x in prices + [adjusted, volume]):
            return False
        op, hi, lo, cl = prices
        return (
            op > 0 and cl > 0 and adjusted > 0 and lo > 0
            and hi >= max(op, cl, lo) and lo <= min(op, cl, hi)
            and volume >= 0
        )
    except (KeyError, ValueError, TypeError, OverflowError):
        return False


def upsert_market_csv(path, incoming):
    """Apply revisions by (Date, Ticker), replacing atomically.

    Return (number_of_new_timestamps, number_of_revised_timestamps).
    Never drop an existing record because another network download returned no data.
    """
    path = Path(path)
    rows = {}
    if path.exists():
        with path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if not valid_market_row(row):
                    raise ValueError(f"Invalid existing OHLCV row in {path}: {row.get('Date')}")
                rows[(row["Date"], row["Ticker"])] = {k: row[k] for k in COLUMNS}
    added = revised = 0
    for row in incoming:
        if not valid_market_row(row):
            continue
        normalized = {key: row[key] for key in COLUMNS}
        normalized["Ticker"] = str(row["Ticker"]).strip().upper()
        normalized["Date"] = str(row["Date"]).strip()
        key = (normalized["Date"], normalized["Ticker"])
        prior = rows.get(key)
        if prior is None:
            added += 1
        elif any(str(float(prior[c])) != str(float(normalized[c])) for c in COLUMNS[2:]):
            revised += 1
        rows[key] = normalized
    if added == 0 and revised == 0 and path.exists():
        return 0, 0
    if not rows:
        return 0, 0

    path.parent.mkdir(parents=True, exist_ok=True)
    # NamedTemporaryFile in same directory allows atomic os.replace, even on Windows.
    fd, temp_path = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=COLUMNS)
            writer.writeheader()
            writer.writerows(rows[k] for k in sorted(rows))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
    return added, revised
