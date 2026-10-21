#!/usr/bin/env python3
"""
Update stock data from Yahoo Finance
=====================================
Updates idx.csv and individual ticker files with latest data.
Can update a single ticker or all tickers.

Usage:
  python update_data.py              # Update all tickers
  python update_data.py BBCA         # Update only BBCA
  python update_data.py --check      # Just show what needs updating
"""

import csv
import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd
from pathlib import Path
import sys
import json
import argparse
import logging
from market_data import upsert_market_csv
from market_calendar import latest_expected_exchange_date, JAKARTA

# Fix encoding for Windows
if sys.platform == 'win32':
    import io
    if hasattr(sys.stdout, 'buffer') and not isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    if hasattr(sys.stderr, 'buffer') and not isinstance(sys.stderr, io.TextIOWrapper):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)

# Settings
BASE_DIR = Path(__file__).parent
CSV_PATH = BASE_DIR / 'public' / 'data' / 'idx.csv'
TICKERS_DIR = BASE_DIR / 'public' / 'data' / 'tickers'

def get_last_trading_day() -> str:
    """Return expected IDX trading date, including published exchange closures."""
    return latest_expected_exchange_date()


def get_ticker_last_date(ticker: str) -> str | None:
    """Get the last date of data for a ticker from its individual file"""
    ticker_file = TICKERS_DIR / f"{ticker}.csv"
    if not ticker_file.exists():
        return None
    
    try:
        with open(ticker_file, 'r') as f:
            # Read last line efficiently without reading whole file
            # But simple readlines is safer for small files
            try:
                # Seek to end and read backwards is better but csv parsing allows simple iteration
                # Let's stick to reading lines for simplicity unless files are huge (daily data is small, ~50kb)
                lines = f.readlines()
            except:
                return None
                
            if len(lines) < 2:
                return None
            # Last non-empty line
            for line in reversed(lines):
                line = line.strip()
                if line:
                    parts = line.split(',')
                    if parts[0] and parts[0] != 'Date':
                        return parts[0]
    except Exception as e:
        print(f"Error reading {ticker_file}: {e}", file=sys.stderr)
    return None


def get_all_tickers() -> list[str]:
    """Get all tickers from idx_tickers.csv"""
    tickers_csv = BASE_DIR / 'public' / 'data' / 'idx_tickers.csv'
    tickers = []
    try:
        with open(tickers_csv, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ticker = row.get('Ticker', '').strip()
                if ticker:
                    tickers.append(ticker)
    except Exception as e:
        print(f"Error reading tickers: {e}", file=sys.stderr)
    return sorted(tickers)


def scrape_ticker_data(ticker: str, start_date: str, end_date: str) -> pd.DataFrame | None:
    """Download historical data for a ticker from Yahoo Finance"""
    try:
        # Download with .JK suffix for Indonesian stocks
        # Note: yfinance end date is exclusive, so add 1 day to include end_date
        end_date_inclusive = (datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        data = yf.download(f"{ticker}.JK", start=start_date, end=end_date_inclusive, progress=False, auto_adjust=False)
        
        if data.empty:
            return None
        
        # Reset index to get Date as a column
        data = data.reset_index()
        return data
    except Exception as e:
        print(f"Error downloading {ticker}: {e}", file=sys.stderr)
        return None


def format_data_for_csv(ticker: str, df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to CSV format rows"""
    rows = []
    
    # Check if columns are MultiIndex (newer yfinance format)
    if isinstance(df.columns, pd.MultiIndex):
        # Flatten MultiIndex columns - keep only the first level (Price type)
        # Actually if we extracted a single ticker slice from batch download, 
        # columns might be just ['Open', 'High'...] but if we iterate batch dataframe directly it's complex.
        # This function assumes standard single-ticker DF structure (Date + OHLCV)
        
        # If df was passed from batch extraction, it should be clean.
        # But let's handle if it still has levels
        try:
            # If 2 levels and 2nd level is ticker, drop it?
            # Or if 2 levels and 1st level is Price?
            if df.columns.nlevels > 1:
                df = df.droplevel(1, axis=1) # Drop Ticker level if present
        except:
            pass
            
    # Normalize column names just in case
    # ...
    
    for idx, row in df.iterrows():
        try:
            # Get date - should be in index after reset_index()
            date_val = row.get('Date') if 'Date' in row.index or 'Date' in df.columns else idx
            # If date is in index, iterrows returns index as first val
            if 'Date' in df.columns:
                date_val = row['Date']
            else:
                date_val = idx # Index is date
            
            # Get price values (now columns are simple strings)
            open_val = row.get('Open')
            high_val = row.get('High')
            low_val = row.get('Low')
            close_val = row.get('Close')
            adj_close_val = row.get('Adj Close', close_val)
            volume_val = row.get('Volume')
            
            # Simple scalar extraction if Series (happens if multiindex not flattened cleanly)
            if hasattr(open_val, 'item'): open_val = open_val.item()
            if hasattr(high_val, 'item'): high_val = high_val.item()
            if hasattr(low_val, 'item'): low_val = low_val.item()
            if hasattr(close_val, 'item'): close_val = close_val.item()
            if hasattr(adj_close_val, 'item'): adj_close_val = adj_close_val.item()
            if hasattr(volume_val, 'item'): volume_val = volume_val.item()

            # Skip if essential values are missing
            if pd.isna(open_val) or pd.isna(close_val):
                continue
            
            # Format date
            date_str = ""
            if hasattr(date_val, 'strftime'):
                date_str = date_val.strftime('%Y-%m-%d')
            else:
                date_str = str(date_val).split()[0] # Timestamp to string
            
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
        except Exception as e:
            # Silently skip rows with errors
            continue
    
    return rows


def update_ticker_file(ticker: str, new_rows: list[dict]):
    """Merge per-ticker history safely; reject invalid provider candles."""
    ticker_file = TICKERS_DIR / f"{ticker}.csv"
    return upsert_market_csv(ticker_file, new_rows)


def update_main_csv(new_rows: list[dict]):
    """Deduplicate and persist the combined archival CSV, including revisions."""
    return upsert_market_csv(CSV_PATH, new_rows)


def update_ticker(ticker: str) -> dict:
    """Update a single ticker with latest data (Sequential/Legacy)"""
    last_date = get_ticker_last_date(ticker)
    today = datetime.now(JAKARTA)
    today_str = today.strftime('%Y-%m-%d')
    
    last_trading_day_str = get_last_trading_day()
    
    if last_date:
        # Check if already up to date (>= last trading day)
        if last_date >= last_trading_day_str:
            return {"ticker": ticker, "status": "up_to_date", "last_date": last_date}
        
        # Start from day after last date
        start_date = (datetime.strptime(last_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
    else:
        # Default to 1 year ago if no data
        start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
    
    # Check if start_date > today (could happen on weekends if logic is strict)
    if start_date > today_str:
         return {"ticker": ticker, "status": "up_to_date", "last_date": last_date}

    print(f"Updating {ticker}: {start_date} -> {today_str}", end=" ", flush=True)
    
    # Download new data
    df = scrape_ticker_data(ticker, start_date, today_str)
    
    if df is None or df.empty:
        print("[NO DATA]")
        return {"ticker": ticker, "status": "up_to_date", "last_date": last_date}
    
    # Format for CSV
    new_rows = format_data_for_csv(ticker, df)
    
    if not new_rows:
        print("[NO ROWS]")
        return {"ticker": ticker, "status": "up_to_date", "last_date": last_date}
    
    # Update both files
    update_ticker_file(ticker, new_rows)
    update_main_csv(new_rows)
    
    new_last_date = new_rows[-1]['Date']
    print(f"[+{len(new_rows)} rows] -> {new_last_date}")
    
    return {
        "ticker": ticker,
        "status": "updated",
        "new_rows": len(new_rows),
        "last_date": new_last_date
    }

def update_batch_tickers(tickers: list[str], reconcile_days: int = 0) -> list[dict]:
    """Update multiple tickers using batch download (Concurrent/Optimized)"""
    results = []
    tickers_to_fetch = []
    ticker_last_dates = {} # Map ticker -> last_date
    
    # Compare like-for-like timezone-naive date objects (all interpreted as WIB).
    today = datetime.now(JAKARTA).replace(tzinfo=None)
    today_str = today.strftime('%Y-%m-%d')
    end_exclusive = (today + timedelta(days=1)).strftime('%Y-%m-%d')

    # Calculate last trading day
    last_trading_day_str = get_last_trading_day()
    
    # 1. Analyze status
    print(f"Analyzing {len(tickers)} tickers...", file=sys.stderr)
    min_start_date = today
    tickers_need_update = []
    
    for ticker in tickers:
        last_date = get_ticker_last_date(ticker)
        ticker_last_dates[ticker] = last_date
        
        needs_update = False
        start_date_obj = None
        
        if last_date:
            if reconcile_days:
                # Include the last few days to capture provider corrections and
                # newly revised adjusted-close factors after corporate actions.
                needs_update = True
                start_date_obj = datetime.strptime(last_date, '%Y-%m-%d') - timedelta(days=reconcile_days)
            elif last_date < last_trading_day_str:
                needs_update = True
                start_date_obj = datetime.strptime(last_date, '%Y-%m-%d') + timedelta(days=1)
        else:
            needs_update = True
            start_date_obj = today - timedelta(days=365) # New ticker: fetch 1y
            
        if needs_update and start_date_obj <= today:
            tickers_need_update.append(ticker)
            if start_date_obj < min_start_date:
                min_start_date = start_date_obj
        else:
            results.append({"ticker": ticker, "status": "up_to_date", "last_date": last_date})

    if not tickers_need_update:
        print("All tickers up to date.", file=sys.stderr)
        return results

    # 2. Batch Download
    start_date_str = min_start_date.strftime('%Y-%m-%d')
    print(f"Batch updating {len(tickers_need_update)} tickers from {start_date_str}...", file=sys.stderr)
    
    # Use batches of 100 for safety, though yf handles more
    BATCH_SIZE = 100
    all_new_rows_for_main = []
    
    for i in range(0, len(tickers_need_update), BATCH_SIZE):
        chunk = tickers_need_update[i:i+BATCH_SIZE]
        print(f"Downloading batch {i//BATCH_SIZE + 1} ({len(chunk)} tickers)...", file=sys.stderr)
        
        chunk_yf = [f"{t}.JK" for t in chunk]
        chunk_str = " ".join(chunk_yf)
        
        try:
             # Redirect stdout to suppress yfinance noise
            original_stdout = sys.stdout
            sys.stdout = sys.stderr
            try:
                # auto_adjust=True default in future, we set False to keep raw OHLC. Or True? 
                # Existing code used scrape_ticker_data default (yfinance defaults have changed over time).
                # To be consistent with recent yfinance warnings: set auto_adjust=False
                data = yf.download(chunk_str, start=start_date_str, end=end_exclusive, group_by='ticker', progress=False, auto_adjust=False, threads=True)
            finally:
                sys.stdout = original_stdout

            if data.empty:
                print(f"[WARN] Batch returned empty data", file=sys.stderr)
                # Mark these as checked/up-to-date to avoid loop? Or failed.
                for t in chunk: results.append({"ticker": t, "status": "no_data", "last_date": ticker_last_dates.get(t)})
                continue
                
            # Process each ticker in chunk
            for ticker in chunk:
                try:
                    t_jk = f"{ticker}.JK"
                    t_df = None
                    
                    if len(chunk) == 1:
                        # Single ticker download returns flat DF (no ticker level) usually
                        # But group_by='ticker' forces it?
                        # yfinance is tricky here.
                        # If simple flat DF, use it directly
                        t_df = data
                    else:
                        if t_jk in data.columns.levels[0]:
                            t_df = data[t_jk]
                        elif ticker in data.columns.levels[0]: # Sometimes without .JK?
                            t_df = data[ticker]
                            
                    if t_df is None or t_df.empty:
                        results.append({"ticker": ticker, "status": "no_new_data", "last_date": ticker_last_dates.get(ticker)})
                        continue
                        
                    # A reconcile fetch keeps rows spanning the lookback
                    # interval so the atomic upsert can apply price revisions.
                    t_last_date = ticker_last_dates.get(ticker)
                    if t_last_date:
                        if not isinstance(t_df.index, pd.DatetimeIndex):
                            t_df.index = pd.to_datetime(t_df.index)
                        local_idx = t_df.index
                        if local_idx.tz is not None:
                            local_idx = local_idx.tz_convert('Asia/Jakarta')
                        cutoff = pd.Timestamp(t_last_date)
                        if reconcile_days:
                            cutoff -= pd.Timedelta(days=reconcile_days)
                            t_df = t_df[local_idx.date >= cutoff.date()]
                        else:
                            t_df = t_df[local_idx.date > cutoff.date()]

                    if t_df.empty:
                        results.append({"ticker": ticker, "status": "no_new_data", "last_date": t_last_date})
                        continue

                    # Reset index for formatting
                    t_df = t_df.reset_index()
                    # Rename 'Date' if needed (if it was index name) by format_data logic handling 
                    
                    new_rows = format_data_for_csv(ticker, t_df)
                    if new_rows:
                        update_ticker_file(ticker, new_rows)
                        all_new_rows_for_main.extend(new_rows)
                        last_row_date = new_rows[-1]['Date']
                        print(f"[{ticker}: +{len(new_rows)} rows -> {last_row_date}]", end=" ", flush=True)
                        results.append({"ticker": ticker, "status": "updated", "new_rows": len(new_rows), "last_date": last_row_date})
                    else:
                         results.append({"ticker": ticker, "status": "no_new_data", "last_date": t_last_date})
                         
                except Exception as e:
                    print(f"[ERROR] processing {ticker}: {e}", file=sys.stderr)
                    results.append({"ticker": ticker, "status": "error", "error": str(e)})

        except Exception as e:
            print(f"[ERROR] Batch download failed: {e}", file=sys.stderr)
    
    print("", flush=True) # newline after inline prints
    
    # Update main CSV once at the end
    if all_new_rows_for_main:
        print(f"Appending {len(all_new_rows_for_main)} rows to idx.csv...", file=sys.stderr)
        update_main_csv(all_new_rows_for_main)
        
    return results


def check_status(tickers: list[str] = None) -> list[dict]:
    """Check which tickers need updating (without actually updating)"""
    if tickers is None:
        tickers = get_all_tickers()
    
    last_trading_day_str = get_last_trading_day()
    
    status = []
    
    for ticker in tickers:
        last_date = get_ticker_last_date(ticker)
        # Consider up-to-date if last date is >= last trading day
        needs_update = last_date is None or last_date < last_trading_day_str
        status.append({
            "ticker": ticker,
            "last_date": last_date,
            "needs_update": needs_update
        })
    
    return status


def main():
    parser = argparse.ArgumentParser(description='Update IDX stock data')
    parser.add_argument('ticker', nargs='?', help='Specific ticker to update (optional)')
    parser.add_argument('--check', action='store_true', help='Only check status, do not update')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parser.add_argument('--reconcile-days', type=int, default=0,
                        help='Re-fetch up to N previous calendar days to capture Yahoo price corrections (0-365)')
    args = parser.parse_args()
    if not 0 <= args.reconcile_days <= 365:
        parser.error('--reconcile-days must be between 0 and 365')
    
    if args.check:
        # Check status only
        if args.ticker:
            status = check_status([args.ticker])
        else:
            status = check_status()
        
        if args.json:
            print(json.dumps(status, indent=2))
        else:
            needs_update = [s for s in status if s['needs_update']]
            print(f"\n{len(needs_update)} / {len(status)} tickers need updating")
            if needs_update[:10]:
                print("\nFirst 10 that need updates:")
                for s in needs_update[:10]:
                    print(f"  {s['ticker']}: last date = {s['last_date']}")
        return
    
    # Update tickers
    if args.ticker:
        # Single ticker: keep legacy path? Or use batch path for consistency?
        # Batch path works for list of 1.
        # But legacy path has specific console outputs the user might expect if running manually.
        # Let's use batch for consistency and robustness.
        tickers = [args.ticker.upper()]
    else:
        tickers = get_all_tickers()
    
    print(f"Updating {len(tickers)} ticker(s)...", file=sys.stderr)
    
    # Use BATCH Update logic
    results = update_batch_tickers(tickers, reconcile_days=args.reconcile_days)
    
    # Summary
    updated = [r for r in results if r['status'] == 'updated']
    up_to_date = [r for r in results if r['status'] == 'up_to_date']
    no_data = [r for r in results if r.get('status') == 'no_new_data']
    
    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  [OK] Updated: {len(updated)} tickers")
    print(f"  [--] Up-to-date: {len(up_to_date)} tickers")
    print(f"  [..] No new data: {len(no_data)} tickers")
    print(f"{'='*60}")
    
    if args.json:
         # Filter out non-serializable objects just in case
        print(json.dumps(results, indent=2, default=str))


if __name__ == '__main__':
    main()
