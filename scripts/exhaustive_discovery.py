#!/usr/bin/env python3
"""
Exhaustive IDX Ticker Discovery
================================
Systematically tests ALL 4-letter combinations against Yahoo Finance
to build a complete list of every IDX ticker that has ever had data.

This is a LONG process (~500,000 combinations) but only needs to run once.
Progress is saved and can be resumed.

Usage:
  python exhaustive_discovery.py                    # Run (default 200/run)
  python exhaustive_discovery.py --batch 500        # Test 500 per run
  python exhaustive_discovery.py --status           # Show progress
  python exhaustive_discovery.py --export           # Export found tickers
"""

import csv
import yfinance as yf
from pathlib import Path
import sys
import argparse
import time
import json
from datetime import datetime
import warnings
import itertools

warnings.filterwarnings('ignore')

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

BASE_DIR = Path(__file__).parent
TICKERS_CSV = BASE_DIR / 'public' / 'data' / 'idx_tickers.csv'
STATE_FILE = BASE_DIR / 'exhaustive_state.json'

ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
TOTAL_COMBINATIONS = 26 ** 4  # 456,976

def get_state():
    if STATE_FILE.exists():
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    return {
        'current_index': 0,
        'found_tickers': [],
        'invalid_tickers': [],
        'started': datetime.now().isoformat()
    }

def save_state(state):
    state['last_update'] = datetime.now().isoformat()
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def index_to_ticker(index):
    """Convert numeric index to 4-letter ticker"""
    result = []
    for _ in range(4):
        result.append(ALPHABET[index % 26])
        index //= 26
    return ''.join(reversed(result))

def test_ticker_quick(ticker):
    """Quick test if ticker has ANY data on Yahoo Finance"""
    try:
        stock = yf.Ticker(f"{ticker}.JK")
        # Try to get just 1 day of history (fastest check)
        hist = stock.history(period='1d')
        if len(hist) > 0:
            return True
        # Try 5 days as backup
        hist = stock.history(period='5d')
        if len(hist) > 0:
            return True
        return False
    except Exception:
        return False

def save_tickers_to_csv(tickers):
    """Save tickers to CSV file"""
    existing = set()
    if TICKERS_CSV.exists():
        with open(TICKERS_CSV, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                t = row.get('Ticker', '').strip()
                if t: existing.add(t)
    
    combined = existing | set(tickers)
    with open(TICKERS_CSV, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Ticker'])
        writer.writeheader()
        for t in sorted(combined):
            writer.writerow({'Ticker': t})
    return len(combined)

def main():
    parser = argparse.ArgumentParser(description='Exhaustive IDX ticker discovery')
    parser.add_argument('--batch', type=int, default=200, help='Tickers to test per run')
    parser.add_argument('--status', action='store_true', help='Show current progress')
    parser.add_argument('--export', action='store_true', help='Export found tickers to CSV')
    parser.add_argument('--reset', action='store_true', help='Reset and start over')
    args = parser.parse_args()
    
    state = get_state()
    
    if args.reset:
        state = {
            'current_index': 0,
            'found_tickers': [],
            'invalid_tickers': [],
            'started': datetime.now().isoformat()
        }
        save_state(state)
        print("Progress reset. Starting from AAAA.")
        return
    
    if args.status:
        progress = (state['current_index'] / TOTAL_COMBINATIONS) * 100
        current_ticker = index_to_ticker(state['current_index']) if state['current_index'] < TOTAL_COMBINATIONS else 'DONE'
        print("=" * 60)
        print("Exhaustive Discovery Status")
        print("=" * 60)
        print(f"Progress: {progress:.2f}% ({state['current_index']:,} / {TOTAL_COMBINATIONS:,})")
        print(f"Current position: {current_ticker}")
        print(f"Found valid tickers: {len(state.get('found_tickers', []))}")
        print(f"Invalid/not found: {len(state.get('invalid_tickers', []))}")
        print(f"Started: {state.get('started', 'N/A')}")
        print(f"Last update: {state.get('last_update', 'N/A')}")
        
        if state.get('found_tickers'):
            print(f"\nRecently found: {state['found_tickers'][-10:]}")
        return
    
    if args.export:
        if state.get('found_tickers'):
            count = save_tickers_to_csv(state['found_tickers'])
            print(f"Exported {len(state['found_tickers'])} found tickers to {TICKERS_CSV}")
            print(f"Total tickers in file: {count}")
        else:
            print("No tickers found yet.")
        return
    
    # Main discovery loop
    print("=" * 60)
    print("Exhaustive IDX Ticker Discovery")
    print("=" * 60)
    
    start_idx = state['current_index']
    end_idx = min(start_idx + args.batch, TOTAL_COMBINATIONS)
    
    if start_idx >= TOTAL_COMBINATIONS:
        print("Discovery complete! All combinations tested.")
        print(f"Total valid tickers found: {len(state.get('found_tickers', []))}")
        return
    
    progress = (start_idx / TOTAL_COMBINATIONS) * 100
    print(f"Starting at: {index_to_ticker(start_idx)} (index {start_idx:,})")
    print(f"Progress: {progress:.2f}%")
    print(f"Testing {end_idx - start_idx} combinations...")
    print()
    
    found_this_run = []
    
    for i in range(start_idx, end_idx):
        ticker = index_to_ticker(i)
        print(f"\r[{i - start_idx + 1}/{end_idx - start_idx}] Testing {ticker}...", end="", flush=True)
        
        if test_ticker_quick(ticker):
            print(f" FOUND!")
            found_this_run.append(ticker)
            state['found_tickers'].append(ticker)
        
        # Minimal delay
        time.sleep(0.2)
    
    # Save progress
    state['current_index'] = end_idx
    save_state(state)
    
    # Summary
    print(f"\n\nResults:")
    print(f"  Tested this run: {end_idx - start_idx}")
    print(f"  Found this run: {len(found_this_run)}")
    print(f"  Total found: {len(state['found_tickers'])}")
    
    if found_this_run:
        print(f"  New tickers: {', '.join(found_this_run)}")
    
    new_progress = (end_idx / TOTAL_COMBINATIONS) * 100
    remaining = TOTAL_COMBINATIONS - end_idx
    est_hours = (remaining / args.batch) * 0.5 / 60  # Rough estimate
    
    print(f"\nProgress: {new_progress:.2f}%")
    print(f"Remaining: {remaining:,} combinations")
    print(f"Run again to continue. Estimated {est_hours:.1f} more hours of running.")

if __name__ == '__main__':
    main()
