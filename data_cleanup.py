#!/usr/bin/env python3
"""
Data Cleanup Script for Intraday Data
======================================
Enforces retention policies by deleting old data and aggregating to higher timeframes.

Retention Policies:
- 1m data: 7 days (1 week)
- 30m data: 180 days (6 months)
- 1h data: 730 days (2 years)
- Daily data: unlimited

Usage:
    python data_cleanup.py                    # Run cleanup
    python data_cleanup.py --dry-run          # Show what would be deleted
    python data_cleanup.py --aggregate        # Aggregate before cleanup
    python data_cleanup.py --ticker BBCA      # Cleanup single ticker
"""

import os
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd

# Handle encoding for Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)

# Settings
BASE_DIR = Path(__file__).parent
INTRADAY_DIR = BASE_DIR / 'public' / 'data' / 'intraday'
DAILY_DIR = BASE_DIR / 'public' / 'data' / 'tickers'

# Retention policies (days)
RETENTION_POLICIES = {
    '1m': 7,        # 1 week
    '5m': 30,       # 1 month  
    '30m': 180,     # 6 months
    '1h': 730,      # 2 years
}


def get_cutoff_date(interval: str) -> datetime:
    """Get the cutoff date for a given interval based on retention policy."""
    days = RETENTION_POLICIES.get(interval, 7)
    return datetime.now() - timedelta(days=days)


def cleanup_ticker_file(file_path: Path, interval: str, dry_run: bool = False) -> dict:
    """
    Remove old rows from a ticker's intraday file.
    
    Returns:
        Dict with cleanup stats
    """
    if not file_path.exists():
        return {'file': str(file_path), 'status': 'not_found'}
    
    try:
        df = pd.read_csv(file_path)
        original_count = len(df)
        
        if original_count == 0:
            return {'file': str(file_path), 'status': 'empty'}
        
        # Parse dates
        df['_date'] = pd.to_datetime(df['Date'])
        
        # Get cutoff
        cutoff = get_cutoff_date(interval)
        
        # Filter to keep only recent data
        df_filtered = df[df['_date'] >= cutoff]
        deleted_count = original_count - len(df_filtered)
        
        result = {
            'file': str(file_path),
            'interval': interval,
            'original_rows': original_count,
            'remaining_rows': len(df_filtered),
            'deleted_rows': deleted_count,
            'cutoff_date': str(cutoff),
        }
        
        if deleted_count > 0:
            if dry_run:
                result['status'] = 'would_delete'
                print(f"[DRY-RUN] {file_path.name}: Would delete {deleted_count} rows older than {cutoff.date()}")
            else:
                # Drop helper column and save
                df_filtered = df_filtered.drop('_date', axis=1)
                df_filtered.to_csv(file_path, index=False)
                result['status'] = 'cleaned'
                print(f"[CLEANED] {file_path.name}: Deleted {deleted_count} rows older than {cutoff.date()}")
        else:
            result['status'] = 'no_change'
            print(f"[OK] {file_path.name}: No rows to delete (all within retention)")
        
        return result
        
    except Exception as e:
        return {'file': str(file_path), 'status': 'error', 'error': str(e)}


def aggregate_to_higher_timeframe(
    source_interval: str,
    target_interval: str,
    ticker: str,
    dry_run: bool = False
) -> dict:
    """
    Aggregate data from lower timeframe to higher timeframe.
    E.g., 1m -> 30m, 30m -> 1h, 1h -> daily
    
    Returns:
        Dict with aggregation stats
    """
    source_dir = INTRADAY_DIR / source_interval
    source_file = source_dir / f"{ticker}.csv"
    
    if target_interval == 'daily':
        target_dir = DAILY_DIR
    else:
        target_dir = INTRADAY_DIR / target_interval
    target_file = target_dir / f"{ticker}.csv"
    
    if not source_file.exists():
        return {'ticker': ticker, 'status': 'source_not_found'}
    
    try:
        df = pd.read_csv(source_file)
        if df.empty:
            return {'ticker': ticker, 'status': 'source_empty'}
        
        # Parse dates
        df['_datetime'] = pd.to_datetime(df['Date'])
        
        # Determine resampling rule
        resample_rules = {
            '30m': '30min',
            '1h': '1h',
            'daily': '1D',
        }
        rule = resample_rules.get(target_interval)
        if not rule:
            return {'ticker': ticker, 'status': 'invalid_target'}
        
        # Set datetime as index for resampling
        df = df.set_index('_datetime')
        
        # Aggregate OHLCV
        agg_df = df.resample(rule).agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum',
        }).dropna()
        
        if agg_df.empty:
            return {'ticker': ticker, 'status': 'no_data_to_aggregate'}
        
        # Reset index
        agg_df = agg_df.reset_index()
        agg_df = agg_df.rename(columns={'_datetime': 'Date'})
        agg_df['Ticker'] = ticker
        agg_df['Adj Close'] = agg_df['Close']
        
        # Format date
        if target_interval == 'daily':
            agg_df['Date'] = agg_df['Date'].dt.strftime('%Y-%m-%d')
        else:
            agg_df['Date'] = agg_df['Date'].dt.strftime('%Y-%m-%d %H:%M:%S')
        
        # Reorder columns
        agg_df = agg_df[['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume']]
        
        result = {
            'ticker': ticker,
            'source': source_interval,
            'target': target_interval,
            'rows_aggregated': len(agg_df),
        }
        
        if dry_run:
            result['status'] = 'would_aggregate'
            print(f"[DRY-RUN] Would aggregate {len(agg_df)} {target_interval} candles for {ticker}")
        else:
            # Merge with existing target file if exists
            target_dir.mkdir(parents=True, exist_ok=True)
            
            if target_file.exists():
                existing = pd.read_csv(target_file)
                combined = pd.concat([existing, agg_df], ignore_index=True)
                combined = combined.drop_duplicates(subset=['Date'], keep='last')
                combined['_sort'] = pd.to_datetime(combined['Date'])
                combined = combined.sort_values('_sort').drop('_sort', axis=1)
                agg_df = combined
            
            agg_df.to_csv(target_file, index=False)
            result['status'] = 'aggregated'
            result['total_rows'] = len(agg_df)
            print(f"[AGGREGATED] {ticker}: {len(agg_df)} {target_interval} candles saved")
        
        return result
        
    except Exception as e:
        return {'ticker': ticker, 'status': 'error', 'error': str(e)}


def cleanup_all(dry_run: bool = False, ticker: str = None, aggregate: bool = False) -> list:
    """
    Run cleanup on all intraday data files.
    
    Returns:
        List of cleanup results
    """
    results = []
    
    for interval in RETENTION_POLICIES.keys():
        interval_dir = INTRADAY_DIR / interval
        
        if not interval_dir.exists():
            print(f"[SKIP] {interval_dir} does not exist")
            continue
        
        print(f"\n=== Processing {interval} data ===")
        
        # Get files to process
        if ticker:
            files = [interval_dir / f"{ticker}.csv"]
        else:
            files = list(interval_dir.glob('*.csv'))
        
        for file_path in files:
            if not file_path.exists():
                continue
            
            # Optionally aggregate first
            if aggregate:
                # 1m -> 30m
                if interval == '1m':
                    agg_result = aggregate_to_higher_timeframe(
                        '1m', '30m', file_path.stem, dry_run
                    )
                    results.append(agg_result)
                # 30m -> 1h
                elif interval == '30m':
                    agg_result = aggregate_to_higher_timeframe(
                        '30m', '1h', file_path.stem, dry_run
                    )
                    results.append(agg_result)
                # 1h -> daily
                elif interval == '1h':
                    agg_result = aggregate_to_higher_timeframe(
                        '1h', 'daily', file_path.stem, dry_run
                    )
                    results.append(agg_result)
            
            # Clean up old data
            result = cleanup_ticker_file(file_path, interval, dry_run)
            results.append(result)
    
    return results


def main():
    parser = argparse.ArgumentParser(description='Cleanup intraday data based on retention policies')
    parser.add_argument('--dry-run', '-n', action='store_true',
                       help='Show what would be deleted without making changes')
    parser.add_argument('--ticker', '-t', type=str,
                       help='Process only specific ticker')
    parser.add_argument('--aggregate', '-a', action='store_true',
                       help='Aggregate to higher timeframes before cleanup')
    parser.add_argument('--json', action='store_true',
                       help='Output results in JSON format')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Data Cleanup Script")
    print("=" * 60)
    print(f"Retention Policies:")
    for interval, days in RETENTION_POLICIES.items():
        print(f"  - {interval}: {days} days")
    print()
    
    if args.dry_run:
        print("[MODE] DRY RUN - No changes will be made\n")
    
    results = cleanup_all(
        dry_run=args.dry_run,
        ticker=args.ticker.upper() if args.ticker else None,
        aggregate=args.aggregate
    )
    
    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    deleted_total = sum(r.get('deleted_rows', 0) for r in results if 'deleted_rows' in r)
    cleaned_files = sum(1 for r in results if r.get('status') in ['cleaned', 'would_delete'])
    
    print(f"Files processed: {len(results)}")
    print(f"Files cleaned: {cleaned_files}")
    print(f"Total rows deleted: {deleted_total}")
    
    if args.json:
        import json
        print("\n" + json.dumps(results, indent=2, default=str))


if __name__ == '__main__':
    main()
