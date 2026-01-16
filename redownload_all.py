#!/usr/bin/env python3
"""
Re-download ALL stock data from Yahoo Finance
==============================================
This script downloads fresh data for all tickers from the beginning,
replacing any potentially flawed historical data.

Features:
- Automatic retry on network failures
- Tracks failed tickers for later retry
- Resumes from where it left off

Usage:
  python redownload_all.py              # Redownload all tickers
  python redownload_all.py BBCA         # Redownload only BBCA
  python redownload_all.py --start 2020-01-01  # Custom start date
  python redownload_all.py --retry      # Retry only previously failed tickers
"""

import csv
import yfinance as yf
from datetime import datetime
import pandas as pd
from pathlib import Path
import sys
import argparse
import shutil
import time
import json

# Fix encoding for Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Settings
BASE_DIR = Path(__file__).parent
CSV_PATH = BASE_DIR / 'public' / 'data' / 'idx.csv'
TICKERS_DIR = BASE_DIR / 'public' / 'data' / 'tickers'
TICKERS_CSV = BASE_DIR / 'public' / 'data' / 'idx_tickers.csv'
BACKUP_DIR = BASE_DIR / 'backup_data'
FAILED_FILE = BASE_DIR / 'failed_tickers.json'

# Default start date (when IDX data typically begins)
DEFAULT_START = '2000-01-01'

# Retry settings
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


def get_all_tickers() -> list[str]:
    """Get all tickers from idx_tickers.csv"""
    tickers = []
    try:
        with open(TICKERS_CSV, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ticker = row.get('Ticker', '').strip()
                if ticker:
                    tickers.append(ticker)
    except Exception as e:
        print(f"Error reading tickers: {e}")
    return sorted(tickers)


def get_failed_tickers() -> list[str]:
    """Get list of previously failed tickers"""
    if FAILED_FILE.exists():
        with open(FAILED_FILE, 'r') as f:
            data = json.load(f)
            return data.get('failed', [])
    return []


def save_failed_tickers(failed: list[str]):
    """Save list of failed tickers for retry"""
    with open(FAILED_FILE, 'w') as f:
        json.dump({'failed': failed, 'timestamp': datetime.now().isoformat()}, f, indent=2)


DELISTED_FILE = BASE_DIR / 'delisted_tickers.json'

def get_delisted_tickers() -> list[str]:
    """Get list of permanently failed/delisted tickers"""
    if DELISTED_FILE.exists():
        with open(DELISTED_FILE, 'r') as f:
            data = json.load(f)
            return data.get('delisted', [])
    return []

def save_delisted_tickers(delisted: list[str]):
    """Save valid tickers to ignore list"""
    current = get_delisted_tickers()
    updated = sorted(list(set(current + delisted)))
    with open(DELISTED_FILE, 'w') as f:
        json.dump({'delisted': updated, 'timestamp': datetime.now().isoformat()}, f, indent=2)

def download_ticker_data(ticker: str, start_date: str, end_date: str) -> pd.DataFrame | None:
    """Download full historical data for a ticker from Yahoo Finance with retry"""
    
    # Check if ignored
    if ticker in get_delisted_tickers():
        print(f"[SKIPPED - delisted]")
        return None

    for attempt in range(MAX_RETRIES):
        try:
            if attempt > 0:
                print(f"  Retry {attempt}/{MAX_RETRIES}...", end=" ", flush=True)
                time.sleep(RETRY_DELAY * attempt)
            
            data = yf.download(f"{ticker}.JK", start=start_date, end=end_date, progress=False)
            
            if data.empty:
                if attempt == MAX_RETRIES - 1:
                    print("[NO DATA]")
                    return None
                continue
            
            # Reset index
            data = data.reset_index()
            # Handle MultiIndex
            if isinstance(data.columns, pd.MultiIndex):
                data.columns = data.columns.get_level_values(0)
            
            print(f"[{len(data)} rows]")
            return data
            
        except Exception as e:
            error_str = str(e).lower()
            
            # Check for permanent errors - don't retry these
            if any(x in error_str for x in ["delisted", "no timezone", "not found", "404", "quote not found"]):
                print(f"[INVALID TICKER - marked as delisted]")
                save_delisted_tickers([ticker])
                return None
                
            if attempt == MAX_RETRIES - 1:
                print(f"[FAILED after {MAX_RETRIES} attempts]")
                return None
    return None


def format_data_for_csv(ticker: str, df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to CSV format rows"""
    rows = []
    
    for idx, row in df.iterrows():
        try:
            date_val = row.get('Date') if 'Date' in row.index else idx
            open_val = row.get('Open')
            high_val = row.get('High')
            low_val = row.get('Low')
            close_val = row.get('Close')
            adj_close_val = row.get('Adj Close', close_val)
            volume_val = row.get('Volume')
            
            if pd.isna(open_val) or pd.isna(close_val):
                continue
            
            if hasattr(date_val, 'strftime'):
                date_str = date_val.strftime('%Y-%m-%d')
            else:
                date_str = str(date_val).split()[0]
            
            rows.append({
                'Date': date_str,
                'Ticker': ticker,
                'Open': float(open_val),
                'High': float(high_val),
                'Low': float(low_val),
                'Close': float(close_val),
                'Adj Close': float(adj_close_val) if not pd.isna(adj_close_val) else float(close_val),
                'Volume': int(volume_val) if not pd.isna(volume_val) else 0
            })
        except Exception:
            continue
    
    return rows


def write_ticker_file(ticker: str, rows: list[dict]):
    """Write ticker data to individual file (overwrites existing)"""
    ticker_file = TICKERS_DIR / f"{ticker}.csv"
    
    with open(ticker_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'])
        writer.writeheader()
        writer.writerows(rows)


def backup_existing_data():
    """Create backup of existing data"""
    if not BACKUP_DIR.exists():
        BACKUP_DIR.mkdir(parents=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Backup idx.csv
    if CSV_PATH.exists():
        backup_path = BACKUP_DIR / f'idx_{timestamp}.csv'
        shutil.copy(CSV_PATH, backup_path)
        print(f"Backed up idx.csv to {backup_path}")
    
    # Backup tickers directory
    if TICKERS_DIR.exists():
        backup_tickers = BACKUP_DIR / f'tickers_{timestamp}'
        shutil.copytree(TICKERS_DIR, backup_tickers)
        print(f"Backed up tickers/ to {backup_tickers}")


def rebuild_idx_csv():
    """Rebuild idx.csv from all individual ticker files"""
    print("\nRebuilding idx.csv from individual ticker files...")
    
    all_rows = []
    for ticker_file in sorted(TICKERS_DIR.glob("*.csv")):
        with open(ticker_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                all_rows.append(row)
    
    # Sort by ticker then date
    all_rows.sort(key=lambda x: (x['Ticker'], x['Date']))
    
    with open(CSV_PATH, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'])
        writer.writeheader()
        writer.writerows(all_rows)
    
    print(f"Wrote {len(all_rows)} rows to {CSV_PATH}")
    return len(all_rows)


def main():
    parser = argparse.ArgumentParser(description='Re-download IDX stock data from Yahoo Finance')
    parser.add_argument('ticker', nargs='?', help='Specific ticker to download (optional)')
    parser.add_argument('--start', default=DEFAULT_START, help=f'Start date (default: {DEFAULT_START})')
    parser.add_argument('--no-backup', action='store_true', help='Skip backup of existing data')
    parser.add_argument('--retry', action='store_true', help='Retry only previously failed tickers')
    parser.add_argument('--rebuild', action='store_true', help='Only rebuild idx.csv from ticker files')
    args = parser.parse_args()
    
    # Just rebuild idx.csv
    if args.rebuild:
        total = rebuild_idx_csv()
        print(f"\n✓ Rebuilt idx.csv with {total} rows")
        return
    
    end_date = datetime.now().strftime('%Y-%m-%d')
    
    # Get tickers to process
    if args.ticker:
        tickers = [args.ticker.upper()]
        print(f"Re-downloading data for {args.ticker.upper()}")
    elif args.retry:
        tickers = get_failed_tickers()
        if not tickers:
            print("No failed tickers to retry!")
            return
        print(f"Retrying {len(tickers)} previously failed tickers")
    else:
        tickers = get_all_tickers()
        print(f"Re-downloading data for ALL {len(tickers)} tickers")
    
    print(f"Date range: {args.start} to {end_date}")
    print(f"Output: {TICKERS_DIR}")
    print(f"Retries per ticker: {MAX_RETRIES}")
    print()
    
    # Backup existing data (only for full download)
    if not args.no_backup and not args.ticker and not args.retry:
        print("Creating backup of existing data...")
        backup_existing_data()
        print()
    
    # Clear old data (only for full download, not retry)
    if not args.ticker and not args.retry:
        print("Clearing old ticker files...")
        for f in TICKERS_DIR.glob("*.csv"):
            f.unlink()
        print()
    
    # Download each ticker
    success_count = 0
    failed_tickers = []
    
    print("Downloading data...")
    for i, ticker in enumerate(tickers):
        print(f"[{i+1}/{len(tickers)}] {ticker}...", end=" ", flush=True)
        
        df = download_ticker_data(ticker, args.start, end_date)
        if df is not None and len(df) > 0:
            rows = format_data_for_csv(ticker, df)
            if rows:
                write_ticker_file(ticker, rows)
                success_count += 1
            else:
                failed_tickers.append(ticker)
        else:
            failed_tickers.append(ticker)
        
        # Small delay between requests to avoid rate limiting
        time.sleep(0.3)
    
    # Save failed tickers for later retry
    if failed_tickers:
        save_failed_tickers(failed_tickers)
        print(f"\nSaved {len(failed_tickers)} failed tickers to {FAILED_FILE}")
        print("Run with --retry to retry failed tickers")
    elif FAILED_FILE.exists():
        FAILED_FILE.unlink()  # Remove file if no failures
    
    # Rebuild idx.csv from all ticker files (only if full update)
    if not args.ticker and not args.retry:
        total_rows = rebuild_idx_csv()
    else:
        print("\nSkipping idx.csv rebuild for single/retry update.")
        total_rows = 0
    
    # Summary
    print()
    print("=" * 60)
    print("COMPLETE!")
    print(f"  ✓ Successfully downloaded: {success_count} tickers")
    print(f"  ✗ Failed: {len(failed_tickers)} tickers")
    print(f"  Total rows: {total_rows}")
    print(f"  Combined CSV: {CSV_PATH}")
    print(f"  Individual files: {TICKERS_DIR}")
    if failed_tickers:
        print(f"\n  Failed tickers: {', '.join(failed_tickers[:20])}")
        if len(failed_tickers) > 20:
            print(f"  ... and {len(failed_tickers) - 20} more")
        print(f"\n  Run 'python redownload_all.py --retry' to retry failed tickers")
    print("=" * 60)


if __name__ == '__main__':
    main()
