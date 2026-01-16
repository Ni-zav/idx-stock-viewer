#!/usr/bin/env python3
"""
Fetch current IDX ticker list
=============================
Manages the IDX ticker list. Use --add to manually add new tickers.
"""

import csv
from pathlib import Path
import sys
import argparse
import io

# Fix encoding for Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Settings
BASE_DIR = Path(__file__).parent
TICKERS_CSV = BASE_DIR / 'public' / 'data' / 'idx_tickers.csv'

def get_existing_tickers() -> set[str]:
    """Get current tickers from file"""
    tickers = set()
    if TICKERS_CSV.exists():
        with open(TICKERS_CSV, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ticker = row.get('Ticker', '').strip()
                if ticker:
                    tickers.add(ticker)
    return tickers

def save_tickers(tickers: set[str]):
    """Save tickers to CSV"""
    sorted_tickers = sorted(tickers)
    
    with open(TICKERS_CSV, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Ticker'])
        writer.writeheader()
        for ticker in sorted_tickers:
            writer.writerow({'Ticker': ticker})
    
    print(f"Saved {len(sorted_tickers)} tickers to {TICKERS_CSV}")

def main():
    parser = argparse.ArgumentParser(description='Manage IDX ticker list')
    parser.add_argument('--add', nargs='+', help='Add tickers to the list')
    parser.add_argument('--remove', nargs='+', help='Remove tickers from the list')
    parser.add_argument('--list', action='store_true', help='List all tickers')
    args = parser.parse_args()
    
    existing = get_existing_tickers()
    print(f"Current list: {len(existing)} tickers")
    
    if args.list:
        for t in sorted(existing):
            print(t)
        return
    
    if args.add:
        new_tickers = set(t.upper() for t in args.add)
        truly_new = new_tickers - existing
        if truly_new:
            print(f"Adding {len(truly_new)} new tickers: {', '.join(sorted(truly_new))}")
            combined = existing | new_tickers
            save_tickers(combined)
        else:
            print("All specified tickers already exist in the list.")
        return
            
    if args.remove:
        to_remove = set(t.upper() for t in args.remove)
        actually_removed = existing & to_remove
        if actually_removed:
            print(f"Removing {len(actually_removed)} tickers: {', '.join(sorted(actually_removed))}")
            remaining = existing - to_remove
            save_tickers(remaining)
        else:
            print("None of the specified tickers were in the list.")
        return
    
    # Default: show usage
    print("\nUsage:")
    print("  python fetch_tickers.py --add BBCA BBNI    (Add tickers)")
    print("  python fetch_tickers.py --remove FREN     (Remove tickers)")
    print("  python fetch_tickers.py --list            (List all tickers)")

if __name__ == '__main__':
    main()
