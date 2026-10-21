#!/usr/bin/env python3
"""
Intraday Data Fetcher for IDX Stocks
=====================================
Fetches intraday data (1m, 30m, 1h) from Yahoo Finance and stores in CSV files.

Usage:
    python intraday_fetcher.py BBCA                    # Fetch 1m data for BBCA
    python intraday_fetcher.py BBCA --interval 30m    # Fetch 30m data
    python intraday_fetcher.py --all --interval 1h    # Fetch 1h for all tickers
    python intraday_fetcher.py BBCA --check           # Check last timestamp
    python intraday_fetcher.py --batch BBCA,BBRI,TLKM # Fetch multiple tickers
"""

import os
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
from market_data import upsert_market_csv, valid_market_row
import time

# Handle encoding for Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)

try:
    import yfinance as yf
except ImportError:
    print("Error: yfinance not installed. Run: pip install yfinance")
    sys.exit(1)

# Settings
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'public' / 'data' / 'intraday'
TICKERS_FILE = BASE_DIR / 'public' / 'data' / 'idx_tickers.csv'

# Interval configurations
INTERVAL_CONFIG = {
    '1m': {
        'period': '7d',      # Yahoo limit for 1m
        'dir': '1m',
    },
    '5m': {
        'period': '60d',
        'dir': '5m',
    },
    '30m': {
        'period': '60d',     # Yahoo limit for 30m
        'dir': '30m',
    },
    '1h': {
        'period': '730d',    # ~2 years 
        'dir': '1h',
    },
}


def get_ticker_file(ticker: str, interval: str) -> Path:
    """Get the CSV file path for a ticker and interval."""
    config = INTERVAL_CONFIG.get(interval)
    if not config:
        raise ValueError(f"Invalid interval: {interval}")
    
    dir_path = DATA_DIR / config['dir']
    dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path / f"{ticker}.csv"


def get_last_timestamp(ticker: str, interval: str) -> datetime | None:
    """Get the last timestamp from the ticker's intraday file."""
    file_path = get_ticker_file(ticker, interval)
    
    if not file_path.exists():
        return None
    
    try:
        # Read only the last few lines for efficiency
        # Using a safer way than iloc[-1] on potentially empty df
        with open(file_path, 'r') as f:
            # minimal read to check if empty
            header = f.readline()
            if not header: return None
            
            # Read just tail
            import collections
            last_lines = collections.deque(f, 1)
            if not last_lines: return None
            
            last_line = last_lines[0].strip()
            if not last_line: return None
            
            # CSV format: Date, ... key is first column
            date_str = last_line.split(',')[0]
            try:
                return pd.to_datetime(date_str)
            except:
                return None
    except Exception as e:
        # Fallback to pandas read if manual read fails
        try:
            df = pd.read_csv(file_path)
            if df.empty: return None
            return pd.to_datetime(df['Date'].iloc[-1])
        except:
            return None


def fetch_intraday(ticker: str, interval: str = '1m') -> pd.DataFrame | None:
    """
    Fetch intraday data from Yahoo Finance for a single ticker.
    """
    config = INTERVAL_CONFIG.get(interval)
    if not config:
        print(f"[ERROR] Invalid interval: {interval}", file=sys.stderr)
        return None
    
    yahoo_ticker = f"{ticker}.JK"  # IDX suffix
    
    try:
        print(f"[INFO] Fetching {interval} data for {ticker}...", file=sys.stderr)
        
        # Check last timestamp to avoid duplicates
        last_ts = get_last_timestamp(ticker, interval)
        start_date = None
        
        if last_ts:
            start_date = last_ts - timedelta(hours=1)
            print(f"[INFO] Last data: {last_ts}, fetching from {start_date}", file=sys.stderr)
        
        stock = yf.Ticker(yahoo_ticker)
        
        if start_date:
            df = stock.history(start=start_date.strftime('%Y-%m-%d'), interval=interval)
        else:
            df = stock.history(period=config['period'], interval=interval)
        
        return process_dataframe(df, ticker)
        
    except Exception as e:
        print(f"[ERROR] Failed to fetch {ticker}: {e}", file=sys.stderr)
        return None

def process_dataframe(df: pd.DataFrame, ticker: str) -> pd.DataFrame | None:
    """Standardize DataFrame format."""
    if df is None or df.empty:
        return None
        
    df = df.reset_index()
    
    # Check if we have required columns
    # Yahoo Dataframe index names vary (Datetime or Date)
    
    # Helper to rename columns
    col_map = {
        'Datetime': 'Date',
        'index': 'Date',
        'Open': 'Open',
        'High': 'High',
        'Low': 'Low',
        'Close': 'Close',
        'Volume': 'Volume',
    }
    df = df.rename(columns=col_map)
    
    if 'Date' not in df.columns:
        # Could be that the index was named "Date" (daily) or "Datetime"
        # reset_index should have handled it, but let's double check column names
        # Sometimes 'Date' is already a column if flat=True?
        pass

    # Ensure required columns exist
    required = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
    if not all(col in df.columns for col in required):
        # Depending on yfinance version, columns might differ.
        return None

    df['Ticker'] = ticker
    df['Adj Close'] = df['Close'] # Intraday Adj Close is usually Close
    
    # Format Date - IMPORTANT: Convert to UTC first for consistent storage
    if 'Date' in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df['Date']):
            # Convert timezone-aware datetime to UTC, then strip timezone
            # This ensures all CSVs store UTC times consistently
            if hasattr(df['Date'].iloc[0], 'tz') and df['Date'].iloc[0].tz is not None:
                df['Date'] = df['Date'].dt.tz_convert('UTC')
            df['Date'] = df['Date'].apply(lambda x: x.strftime('%Y-%m-%d %H:%M:%S'))

    df = df[['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume']]
    return df

def fetch_batch_intraday(tickers: list[str], interval: str = '1m') -> dict[str, bool]:
    """
    Fetch intraday data for multiple tickers in one request.
    Returns dict of {ticker: success_bool}
    """
    if not tickers:
        return {}
        
    config = INTERVAL_CONFIG.get(interval)
    if not config:
        print(f"[ERROR] Invalid interval: {interval}", file=sys.stderr)
        return {t: False for t in tickers}

    results = {}
    
    # Prepare ticker list for Yahoo
    # Note: Yahoo batch download can be unreliable for too many tickers or mixed validity
    # But for valid IDX tickers it should be fine.
    yahoo_tickers = [f"{t}.JK" for t in tickers]
    tickers_str = " ".join(yahoo_tickers)
    
    # print(f"[INFO] Batch fetching {interval} data for {len(tickers)} tickers...", file=sys.stderr)
    
    try:
        # We use a fixed period here because dynamic start dates per ticker is complex in batch
        # For streaming updates, '1d' or '5d' is usually sufficient and fast.
        # But to be safe and consistent with single fetch, we use the config period.
        # '7d' for 1m is fine. '60d' for 5m might be heavy but yfinance handles it.
        
        # Optimization: If we are just streaming updates, maybe we don't need full history every time?
        # But 'period' is the safest way to ensure we get data.
        
        # However, downloading 7 days of 1m data for 50 tickers is (50 * 7 * 390 rows) ~ 136k rows.
        # It might take a few seconds but faster than 50 requests.
        
        # To optimize "checking same stuff", we could verify if we really need data.
        # But let's rely on yf.download speed first.
        
        download_period = config['period']
        
        # yf.download prints to stdout by default, silence it
        import io
        from contextlib import redirect_stdout
        
        # Use shared=True? default is False which might raise errors separately?
        # group_by='ticker' is crucial
        
        # Capture stdout to avoid "dt.datetime has moved" warnings polluting output if any
        # (Though we redirected sys.stdout to handle encoding, strict capture is safer for JSON safety)
        
        # Actually yfinance uses 'print' which goes to sys.stdout. 
        # Since we want JSON output on stdout, we MUST capture anything yfinance prints.
        # But we already redirected print calls in our code to stderr. 
        # yfinance internal prints might still go to original stdout if not monkeypatched?
        # No, we wrapped sys.stdout. But usage of `print()` inside libraries uses the current sys.stdout.
        # So we should temporarily redirect sys.stdout to sys.stderr!
        
        original_stdout = sys.stdout
        sys.stdout = sys.stderr # Redirect all library output to stderr
        
        try:
            data = yf.download(
                tickers_str, 
                period=download_period, 
                interval=interval, 
                group_by='ticker', 
                threads=True,
                progress=False,
                auto_adjust=False 
            )
        finally:
            sys.stdout = original_stdout # Restore
            
        if data.empty:
            print("[WARN] Batch download returned empty data", file=sys.stderr)
            return {t: False for t in tickers}
            
        # Process each ticker
        for ticker in tickers:
            try:
                # Extract data for this ticker
                # If only 1 ticker, the DataFrame structure is flat (no MultiIndex for columns if we didn't force it)
                # But with group_by='ticker', it should be MultiIndex if > 1 ticker?
                # Actually if 1 ticker it ignores group_by='ticker' in some versions.
                
                t_data = None
                yt = f"{ticker}.JK"
                
                if len(tickers) == 1:
                    t_data = data
                else:
                    if yt in data.columns.levels[0]: # Check if ticker exists in Top Level
                        t_data = data[yt]
                
                if t_data is None or t_data.empty:
                    print(f"[WARN] No data for {ticker} in batch", file=sys.stderr)
                    results[ticker] = False
                    continue
                
                # Drop rows where all cols are NaN
                t_data = t_data.dropna(how='all')
                
                if t_data.empty:
                    results[ticker] = False
                    continue

                processed = process_dataframe(t_data, ticker)
                if processed is not None:
                    new_rows = update_intraday_file(ticker, interval, processed)
                    results[ticker] = True
                else:
                    results[ticker] = False
                    
            except Exception as e:
                print(f"[ERROR] Error processing batch ticker {ticker}: {e}", file=sys.stderr)
                results[ticker] = False
                
    except Exception as e:
        print(f"[ERROR] Batch download failed: {e}", file=sys.stderr)
        return {t: False for t in tickers}
        
    return results


def update_intraday_file(ticker: str, interval: str, new_data: pd.DataFrame) -> int:
    """Atomically upsert valid candles, including revised in-progress candles.

    A provider can revise the same timestamp without adding a new row;
    those changes must be persisted rather than ignored.
    """
    file_path = get_ticker_file(ticker, interval)
    valid_rows = [
        row for row in new_data.to_dict(orient='records')
        if valid_market_row(row)
    ]
    new_count, revised_count = upsert_market_csv(file_path, valid_rows)
    if revised_count:
        print(f"[INFO] {ticker} {interval}: corrected {revised_count} existing candles", file=sys.stderr)
    return new_count


def get_all_tickers() -> list[str]:
    """Get all tickers from idx_tickers.csv."""
    if not TICKERS_FILE.exists():
        print(f"[ERROR] Tickers file not found: {TICKERS_FILE}", file=sys.stderr)
        return []
    
    tickers = []
    with open(TICKERS_FILE, 'r') as f:
        for line in f:
            ticker = line.strip()
            if ticker and not ticker.startswith('#'):
                tickers.append(ticker)
    
    return tickers


def main():
    parser = argparse.ArgumentParser(description='Fetch intraday stock data')
    parser.add_argument('ticker', nargs='?', help='Ticker symbol (e.g., BBCA)')
    parser.add_argument('--interval', '-i', default='1m', 
                       choices=['1m', '5m', '30m', '1h'],
                       help='Time interval (default: 1m)')
    parser.add_argument('--all', '-a', action='store_true',
                       help='Fetch all tickers from idx_tickers.csv')
    parser.add_argument('--batch', '-b', type=str,
                       help='Comma-separated list of tickers')
    parser.add_argument('--check', '-c', action='store_true',
                       help='Only check last timestamp, do not fetch')
    parser.add_argument('--json', action='store_true',
                       help='Output in JSON format')
    
    args = parser.parse_args()
    
    # Determine which tickers to process
    if args.all:
        tickers = get_all_tickers()
        print(f"[INFO] Processing {len(tickers)} tickers...", file=sys.stderr)
    elif args.batch:
        tickers = [t.strip().upper() for t in args.batch.split(',')]
    elif args.ticker:
        tickers = [args.ticker.upper()]
    else:
        parser.print_help()
        return
    
    results = []
    
    # Check mode
    if args.check:
        for ticker in tickers:
            last_ts = get_last_timestamp(ticker, args.interval)
            result = {
                'ticker': ticker,
                'interval': args.interval,
                'last_timestamp': str(last_ts) if last_ts else None,
            }
            results.append(result)
            if not args.json:
                print(f"{ticker}: Last {args.interval} data at {last_ts or 'N/A'}")
    
    # Batch fetch mode (optimized)
    elif len(tickers) > 1:
        # Fetch in chunks of 50 to be safe with URL length or Yahoo limits?
        # yfinance splits automatically? roughly.
        # But let's split manually to be safe.
        BATCH_SIZE = 50
        
        for i in range(0, len(tickers), BATCH_SIZE):
            chunk = tickers[i:i+BATCH_SIZE]
            batch_results = fetch_batch_intraday(chunk, args.interval)
            
            for ticker, success in batch_results.items():
                results.append({
                    'ticker': ticker,
                    'interval': args.interval,
                    'success': success
                })
                
    # Single fetch mode
    else:
        for ticker in tickers:
            df = fetch_intraday(ticker, args.interval)
            success = False
            if df is not None:
                update_intraday_file(ticker, args.interval, df)
                success = True
            
            results.append({
                'ticker': ticker,
                'interval': args.interval,
                'success': success,
            })
    
    if args.json:
        import json
        print(json.dumps(results, indent=2, default=str))


if __name__ == '__main__':
    main()
