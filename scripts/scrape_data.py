#!/usr/bin/env python3
"""
Scrape stock data from Yahoo Finance and append to existing CSV
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
        print(f"Downloading {ticker}...", end=" ", flush=True)
        # Download with .JK suffix for Indonesian stocks
        data = yf.download(f"{ticker}.JK", start=start_date, end=end_date, progress=False)
        
        # Reset column names to handle different yfinance versions
        data = data.reset_index()
        
        print(f"[OK] ({len(data)} rows)")
        return data
    except Exception as e:
        print(f"[ERROR] {e}")
        return None

def format_data_for_csv(ticker, df):
    """Convert DataFrame to CSV format rows"""
    rows = []
    for idx, row in df.iterrows():
        try:
            # Get values - handle different column names
            if 'Open' in row:
                open_val = row['Open']
                high_val = row['High']
                low_val = row['Low']
                close_val = row['Close']
                adj_close_val = row.get('Adj Close', close_val) if 'Adj Close' in row else close_val
                volume_val = row['Volume']
                date_val = row.get('Date')
            else:
                continue
            
            # Skip if nan
            if pd.isna(open_val) or pd.isna(close_val):
                continue
            
            # Handle date format
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
        except Exception as e:
            continue
    return rows

def append_to_csv(new_rows):
    """Append new rows to existing CSV"""
    if not new_rows:
        print("No new data to append")
        return
    
    with open(CSV_PATH, 'a', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'])
        writer.writerows(new_rows)
    
    print(f"[SUCCESS] Appended {len(new_rows)} rows to CSV")

def main():
    print(f"Scraping data from {START_DATE} to {END_DATE}")
    print(f"CSV Path: {CSV_PATH}\n")
    
    if not CSV_PATH.exists():
        print(f"Error: CSV file not found at {CSV_PATH}")
        return
    
    # Get tickers
    tickers = get_unique_tickers()
    print(f"Found {len(tickers)} unique tickers\n")
    
    # Scrape data
    all_new_rows = []
    for ticker in tickers:
        df = scrape_ticker_data(ticker, START_DATE, END_DATE)
        if df is not None and len(df) > 0:
            rows = format_data_for_csv(ticker, df)
            all_new_rows.extend(rows)
    
    # Append to CSV
    append_to_csv(all_new_rows)
    print("Done!")

if __name__ == '__main__':
    main()
