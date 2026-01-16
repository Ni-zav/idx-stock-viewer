#!/usr/bin/env python3
"""
Extract unique tickers from idx.csv and save to a separate file
This creates a small file for uploading to Kaggle
"""

import csv
from pathlib import Path

CSV_PATH = Path(__file__).parent / 'public' / 'data' / 'idx.csv'
OUTPUT_PATH = Path(__file__).parent / 'public' / 'data' / 'idx_tickers.csv'

def extract_unique_tickers():
    """Extract unique tickers from CSV"""
    tickers = []
    seen = set()
    
    print(f"Reading from: {CSV_PATH}")
    
    with open(CSV_PATH, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = row.get('Ticker', '').strip()
            if ticker and ticker not in seen:
                tickers.append(ticker)
                seen.add(ticker)
    
    # Sort for consistency
    tickers.sort()
    
    return tickers

def save_tickers(tickers):
    """Save tickers to CSV"""
    print(f"Saving to: {OUTPUT_PATH}")
    
    with open(OUTPUT_PATH, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Ticker'])  # Header
        for ticker in tickers:
            writer.writerow([ticker])

def main():
    print("=" * 60)
    print("Extract Unique Tickers from idx.csv")
    print("=" * 60)
    
    tickers = extract_unique_tickers()
    
    print(f"\nFound {len(tickers)} unique tickers")
    print(f"First 10: {tickers[:10]}")
    print(f"Last 10: {tickers[-10:]}")
    
    save_tickers(tickers)
    
    # Show file size
    file_size = OUTPUT_PATH.stat().st_size / 1024  # KB
    print(f"\n✓ Saved {len(tickers)} tickers")
    print(f"File size: {file_size:.2f} KB")
    print(f"\nYou can now upload idx_tickers.csv to Kaggle instead of the large idx.csv")
    print("=" * 60)

if __name__ == '__main__':
    main()
