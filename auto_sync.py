#!/usr/bin/env python3
"""
IDX Auto-Sync Master Script
===========================
One-stop script to:
1. Optionally discover new tickers from Yahoo Finance
2. Identify missing local data
3. Download only what's needed

Usage:
  python auto_sync.py                   # Sync existing tickers only
  python auto_sync.py --discover        # Also run ticker discovery (slow)
  python auto_sync.py --discover --batch 200  # Discover with custom batch size
"""

import sys
import csv
from pathlib import Path
import json
import time
import subprocess

# Settings
BASE_DIR = Path(__file__).parent
TICKERS_DIR = BASE_DIR / 'public' / 'data' / 'tickers'
TICKERS_CSV = BASE_DIR / 'public' / 'data' / 'idx_tickers.csv'
FAILED_FILE = BASE_DIR / 'failed_tickers.json'
DELISTED_FILE = BASE_DIR / 'delisted_tickers.json'

def get_all_tickers():
    tickers = set()
    if TICKERS_CSV.exists():
        with open(TICKERS_CSV, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                t = row.get('Ticker', '').strip()
                if t: tickers.add(t)
    return tickers

def get_existing_data_tickers():
    existing = set()
    if TICKERS_DIR.exists():
        for f in TICKERS_DIR.glob("*.csv"):
            existing.add(f.stem)
    return existing

def get_delisted_tickers():
    if DELISTED_FILE.exists():
        try:
            with open(DELISTED_FILE, 'r') as f:
                data = json.load(f)
                return set(data.get('delisted', []))
        except:
            pass
    return set()

def run_discovery(batch_size):
    """Run ticker discovery subprocess"""
    print("\n[DISCOVERY] Running ticker discovery...")
    print("=" * 60)
    
    cmd = [sys.executable, 'discover_tickers.py', '--batch', str(batch_size)]
    result = subprocess.run(cmd, cwd=BASE_DIR)
    
    print("=" * 60)
    return result.returncode == 0

def main():
    import argparse
    parser = argparse.ArgumentParser(description='IDX Auto-Sync')
    parser.add_argument('--discover', action='store_true', help='Run ticker discovery before sync')
    parser.add_argument('--batch', type=int, default=50, help='Discovery batch size')
    args = parser.parse_args()
    
    print("Starting IDX Auto-Sync...")
    
    # 0. Optional: Run discovery
    if args.discover:
        run_discovery(args.batch)
    
    # 1. Check for Missing Data
    print("\n[SYNC] Checking for missing data...")
    all_tickers = get_all_tickers()
    existing_data = get_existing_data_tickers()
    delisted = get_delisted_tickers()
    
    # Exclude delisted from consideration
    valid_tickers = all_tickers - delisted
    missing = valid_tickers - existing_data
    
    # Also check previously failed (but not delisted)
    failed = set()
    if FAILED_FILE.exists():
        try:
            with open(FAILED_FILE, 'r') as f:
                data = json.load(f)
                failed = set(data.get('failed', [])) - delisted
        except:
            pass
            
    to_download = missing | failed
    
    print(f"  Total Tickers listed: {len(all_tickers)}")
    print(f"  Delisted/Invalid:     {len(delisted)}")
    print(f"  Valid Tickers:        {len(valid_tickers)}")
    print(f"  Local Data files:     {len(existing_data)}")
    print(f"  Missing Data:         {len(missing)}")
    print(f"  Previously Failed:    {len(failed)}")
    print(f"  -------------------------------")
    print(f"  TO DOWNLOAD:          {len(to_download)}")
    
    if not to_download:
        print("\n✓ All data is up to date! Nothing to download.")
        return

    # 2. Download Missing/Failed
    print("\n[DOWNLOAD] Downloading missing/failed data...")
    
    import redownload_all
    
    print(f"Starting download for {len(to_download)} tickers...")
    
    success_count = 0
    fail_count = 0
    failed_list = []
    
    target_list = sorted(list(to_download))
    
    end_date = redownload_all.datetime.now().strftime('%Y-%m-%d')
    start_date = redownload_all.DEFAULT_START
    
    for i, ticker in enumerate(target_list):
        print(f"[{i+1}/{len(target_list)}] {ticker}...", end=" ", flush=True)
        
        df = redownload_all.download_ticker_data(ticker, start_date, end_date)
        
        if df is not None and not df.empty:
            rows = redownload_all.format_data_for_csv(ticker, df)
            if rows:
                redownload_all.write_ticker_file(ticker, rows)
                success_count += 1
            else:
                fail_count += 1
                failed_list.append(ticker)
        else:
            fail_count += 1
            if ticker not in redownload_all.get_delisted_tickers():
                failed_list.append(ticker)
            
        time.sleep(0.3)
        
    # Rebuild main CSV
    redownload_all.rebuild_idx_csv()
    
    # Save failed (excluding delisted)
    if failed_list:
        redownload_all.save_failed_tickers(failed_list)
        print(f"\nSaved {len(failed_list)} failed tickers to retry later.")
    elif FAILED_FILE.exists():
        FAILED_FILE.unlink()

    # Summary
    print("\n" + "=" * 60)
    print("Auto-Sync Complete!")
    print(f"  ✓ Downloaded: {success_count}")
    print(f"  ✗ Failed:     {fail_count}")
    print(f"  Delisted:     {len(redownload_all.get_delisted_tickers())}")
    print("=" * 60)
    
    if args.discover:
        print("\nTip: Run again with --discover to find more new tickers")

if __name__ == '__main__':
    main()
