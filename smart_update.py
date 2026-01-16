#!/usr/bin/env python3
"""
Smart Update - Prioritized stock data updater
==============================================
Updates stock data intelligently:
1. First updates the specified ticker (usually the active chart)
2. Then updates other tickers in the background

Usage:
  python smart_update.py BBCA              # Prioritize BBCA, then update others
  python smart_update.py BBCA --priority-only  # Only update BBCA
  python smart_update.py --check BBCA      # Check if BBCA needs update
"""

import sys
import json
import argparse
from datetime import datetime
from pathlib import Path

# Import from update_data module
from update_data import (
    get_all_tickers, 
    get_ticker_last_date,
    update_ticker,
    update_batch_tickers,
    check_status
)

# Fix encoding for Windows
if sys.platform == 'win32':
    import io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    if hasattr(sys.stderr, 'buffer') and not isinstance(sys.stderr, io.TextIOWrapper):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)


def smart_update(priority_ticker: str = None, priority_only: bool = False, max_updates: int = None):
    """
    Smart update: prioritize one ticker, then update others
    
    Args:
        priority_ticker: Ticker to update first (can be None)
        priority_only: If True, only update the priority ticker
        max_updates: Maximum number of tickers to update (None = all)
    
    Returns:
        dict with update results
    """
    today = datetime.now().strftime('%Y-%m-%d')
    results = {
        "priority": None,
        "background": [],
        "skipped": 0,
        "total_updated": 0
    }
    
    # Get all tickers
    all_tickers = get_all_tickers()
    
    # Update priority ticker first
    if priority_ticker:
        priority_ticker = priority_ticker.upper()
        if priority_ticker in all_tickers:
            print(f"[PRIORITY] Updating {priority_ticker}...")
            result = update_ticker(priority_ticker)
            results["priority"] = result
            results["total_updated"] += 1 if result["status"] == "updated" else 0
            
            # Remove from list for background updates
            all_tickers = [t for t in all_tickers if t != priority_ticker]
        else:
            print(f"Warning: {priority_ticker} not found in ticker list")
    
    # If priority-only mode, stop here
    if priority_only:
        print(f"\n[PRIORITY-ONLY MODE] Updated {priority_ticker} only")
        return results
    
    # Update other tickers in the background
    print(f"\n[BACKGROUND] Checking remaining {len(all_tickers)} tickers...")
    
    # Check which tickers need updating
    status = check_status(all_tickers)
    needs_update = [s for s in status if s['needs_update']]
    
    if not needs_update:
        print("All tickers are up to date!")
        return results
    
    print(f"Found {len(needs_update)} tickers that need updating")
    
    # Limit if max_updates specified
    to_update = needs_update
    if max_updates and len(to_update) > max_updates:
        to_update = to_update[:max_updates]
        results["skipped"] = len(needs_update) - max_updates
    
    # Update tickers
    # Update tickers using BATCH method
    if to_update:
        tickers_list = [s['ticker'] for s in to_update]
        print(f"Batch updating {len(tickers_list)} tickers...")
        batch_results = update_batch_tickers(tickers_list)
        results["background"] = batch_results
        results["total_updated"] += len([r for r in batch_results if r["status"] == "updated"])
    
    return results


def quick_check(ticker: str) -> dict:
    """
    Quickly check if a ticker needs updating without downloading data
    
    Returns:
        dict with ticker status and decision
    """
    today = datetime.now().strftime('%Y-%m-%d')
    last_date = get_ticker_last_date(ticker)
    
    needs_update = last_date is None or last_date < today
    
    return {
        "ticker": ticker,
        "last_date": last_date,
        "needs_update": needs_update,
        "today": today
    }


def main():
    parser = argparse.ArgumentParser(description='Smart IDX stock data updater')
    parser.add_argument('ticker', nargs='?', help='Priority ticker to update first')
    parser.add_argument('--priority-only', action='store_true', help='Only update priority ticker')
    parser.add_argument('--check', action='store_true', help='Only check if update needed')
    parser.add_argument('--max', type=int, help='Max number of background updates')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    args = parser.parse_args()
    
    # Quick check mode
    if args.check:
        if not args.ticker:
            print("Error: --check requires a ticker argument")
            sys.exit(1)
        
        result = quick_check(args.ticker.upper())
        
        if args.json:
            print(json.dumps(result))
        else:
            status = "NEEDS UPDATE" if result['needs_update'] else "UP TO DATE"
            print(f"{result['ticker']}: {status}")
            print(f"  Last date: {result['last_date']}")
            print(f"  Today: {result['today']}")
        return
    
    # Smart update mode
    print("="*60)
    print("SMART UPDATE - Prioritized Stock Data Updater")
    print("="*60)
    
    results = smart_update(
        priority_ticker=args.ticker,
        priority_only=args.priority_only,
        max_updates=args.max
    )
    
    # Print summary
    print(f"\n{'='*60}")
    print("SUMMARY:")
    
    if results["priority"]:
        p = results["priority"]
        status_icon = "✓" if p["status"] == "updated" else "•"
        print(f"  [PRIORITY] {status_icon} {p['ticker']}: {p['status']}")
    
    if results["background"]:
        updated = [r for r in results["background"] if r["status"] == "updated"]
        print(f"  [BACKGROUND] ✓ Updated: {len(updated)} tickers")
        print(f"  [BACKGROUND] • Skipped: {len(results['background']) - len(updated)} tickers")
    
    if results["skipped"]:
        print(f"  [SKIPPED] {results['skipped']} tickers (use --max to increase)")
    
    print(f"\n  TOTAL UPDATED: {results['total_updated']} tickers")
    print("="*60)
    
    if args.json:
        print("\n" + json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
