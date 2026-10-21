#!/usr/bin/env python3
"""Initialize a small local IDX dataset; Yahoo Finance access is required."""
import argparse
import csv
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
TICKERS = DATA / "idx_tickers.csv"


def main():
    parser = argparse.ArgumentParser(description="Initialize local IDX stock data")
    parser.add_argument("--tickers", nargs="+", default=["BBCA", "BBRI", "BMRI", "TLKM"],
                        help="Four-letter IDX symbols to initialize")
    args = parser.parse_args()
    tickers = sorted({ticker.strip().upper() for ticker in args.tickers})
    if not tickers or any(len(t) != 4 or not t.isascii() or not t.isalpha() for t in tickers):
        parser.error("Provide one or more four-letter IDX symbols")
    DATA.mkdir(parents=True, exist_ok=True)
    with TICKERS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Ticker"])
        writer.writerows([[ticker] for ticker in tickers])
    print(f"Created {TICKERS} with {len(tickers)} IDX tickers")

    subprocess.run([sys.executable, str(ROOT / "update_data.py")], cwd=ROOT, check=True)
    stored = [ticker for ticker in tickers if (DATA / "tickers" / f"{ticker}.csv").exists()]
    if not stored:
        raise SystemExit("No ticker prices downloaded. Check Yahoo connectivity, then retry.")
    subprocess.run([sys.executable, str(ROOT / "generate_dashboard.py")], cwd=ROOT, check=True)
    print(f"Bootstrap complete: {len(stored)}/{len(tickers)} symbols populated.")


if __name__ == "__main__":
    main()
