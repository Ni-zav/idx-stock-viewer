#!/usr/bin/env python3
"""
Fast version - Only scrape recent data and sample tickers for demo
"""

import csv
import yfinance as yf
from datetime import datetime
import pandas as pd
from pathlib import Path
import sys

# Fix encoding for Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Settings
CSV_PATH = Path(__file__).parent / 'public' / 'data' / 'idx.csv'
START_DATE = '2024-05-17'
END_DATE = datetime.now().strftime('%Y-%m-%d')
BATCH_SIZE = 50  # Process in batches to avoid API rate limiting

def get_unique_tickers():
    """Extract unique tickers from existing CSV"""
    tickers = set()
    with open(CSV_PATH, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tickers.add(row['Ticker'])
    return sorted(list(tickers))

def scrape_ticker_data(ticker, start_date, end_date):
    """Download historical data for a ticker"""
    try:
        data = yf.download(f"{ticker}.JK", start=start_date, end=end_date, progress=False)
        
        if data is None or len(data) == 0:
            return None
        
        # Reset column names
        data = data.reset_index()
        return data
    except:
        return None

def format_data_for_csv(ticker, df):
    """Convert DataFrame to CSV format rows"""
    rows = []
    if df is None or len(df) == 0:
        return rows
        
    for idx, row in df.iterrows():
        try:
            if 'Open' in row and 'Close' in row:
                open_val = row['Open']
                high_val = row['High']
                low_val = row['Low']
                close_val = row['Close']
                adj_close_val = row.get('Adj Close', close_val) if 'Adj Close' in row else close_val
                volume_val = row['Volume']
                date_val = row.get('Date')
                
                if pd.isna(open_val) or pd.isna(close_val):
                    continue
                
                if date_val is not None:
                    if hasattr(date_val, 'strftime'):
                        date_str = date_val.strftime('%Y-%m-%d')
                    else:
                        date_str = str(date_val).split()[0]
                else:
                    continue
                
                rows.append({
                    'Date': date_str,
                    'Ticker': ticker,
                    'Open': float(open_val),
                    'High': float(high_val),
                    'Low': float(low_val),
                    'Close': float(close_val),
                    'Adj Close': float(adj_close_val),
                    'Volume': int(volume_val)
                })
        except:
            continue
    
    return rows

def append_to_csv(new_rows):
    """Append new rows to existing CSV"""
    if not new_rows:
        print("No new data to append")
        return 0
    
    with open(CSV_PATH, 'a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'])
        writer.writerows(new_rows)
    
    return len(new_rows)

def main():
    print(f"Scraping data from {START_DATE} to {END_DATE}")
    print(f"CSV Path: {CSV_PATH}\n")
    
    if not CSV_PATH.exists():
        print(f"Error: CSV file not found at {CSV_PATH}")
        return
    
    # Get tickers
    tickers = get_unique_tickers()
    print(f"Found {len(tickers)} unique tickers\n")
    print("Starting scrape...\n")
    
    # Scrape data
    all_new_rows = []
    successful = 0
    failed = 0
    total_rows = 0
    
    for i, ticker in enumerate(tickers, 1):
        df = scrape_ticker_data(ticker, START_DATE, END_DATE)
        
        if df is not None and len(df) > 0:
            rows = format_data_for_csv(ticker, df)
            if rows:
                all_new_rows.extend(rows)
                successful += 1
                total_rows += len(rows)
                status = f"OK ({len(rows)} rows)"
            else:
                failed += 1
                status = "OK (0 rows)"
        else:
            failed += 1
            status = "No data"
        
        # Show progress every 50 tickers
        if i % BATCH_SIZE == 0:
            print(f"Progress: {i}/{len(tickers)} tickers processed | {successful} success, {failed} failed | {total_rows} total rows")
    
    print(f"\nScraping complete: {successful} success, {failed} failed")
    
    # Append to CSV
    appended = append_to_csv(all_new_rows)
    print(f"[SUCCESS] Appended {appended} rows to CSV")
    print("Done!")

if __name__ == '__main__':
    main()
