#!/usr/bin/env python3
"""
Simple scraper - test with sample tickers first
"""

import csv
import yfinance as yf
from datetime import datetime
import pandas as pd
from pathlib import Path

CSV_PATH = Path(__file__).parent / 'public' / 'data' / 'idx.csv'
START_DATE = '2024-05-17'
END_DATE = datetime.now().strftime('%Y-%m-%d')

def get_sample_tickers(n=10):
    """Get first N tickers from CSV"""
    tickers = []
    count = 0
    with open(CSV_PATH, 'r') as f:
        reader = csv.DictReader(f)
        seen = set()
        for row in reader:
            ticker = row['Ticker']
            if ticker not in seen:
                tickers.append(ticker)
                seen.add(ticker)
                count += 1
                if count >= n:
                    break
    return tickers

def scrape_and_save():
    print(f"Scraping from {START_DATE} to {END_DATE}")
    tickers = get_sample_tickers(10)
    print(f"Testing with {len(tickers)} sample tickers: {tickers}\n")
    
    all_rows = []
    for ticker in tickers:
        try:
            print(f"Scraping {ticker}...", end="", flush=True)
            data = yf.download(f"{ticker}.JK", start=START_DATE, end=END_DATE, progress=False)
            
            if data is not None and len(data) > 0:
                data = data.reset_index()
                print(f" OK ({len(data)} rows)")
                
                for idx, row in data.iterrows():
                    try:
                        all_rows.append({
                            'Date': pd.Timestamp(row['Date']).strftime('%Y-%m-%d'),
                            'Ticker': ticker,
                            'Open': float(row['Open']),
                            'High': float(row['High']),
                            'Low': float(row['Low']),
                            'Close': float(row['Close']),
                            'Adj Close': float(row.get('Adj Close', row['Close'])),
                            'Volume': int(row['Volume'])
                        })
                    except:
                        pass
            else:
                print(" (no data)")
        except Exception as e:
            print(f" (error: {str(e)[:50]})")
    
    # Append to CSV
    if all_rows:
        with open(CSV_PATH, 'a', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'])
            writer.writerows(all_rows)
        print(f"\nAppended {len(all_rows)} new rows to CSV")
    
    print("Done!")

if __name__ == '__main__':
    scrape_and_save()
