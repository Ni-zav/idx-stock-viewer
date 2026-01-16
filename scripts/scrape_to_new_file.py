#!/usr/bin/env python3
"""
Scrape stock data from Yahoo Finance and save to a separate file
"""

import csv
import yfinance as yf
from datetime import datetime
from pathlib import Path
import warnings

# Suppress FutureWarnings
warnings.filterwarnings('ignore', category=FutureWarning)

DATA_DIR = Path(__file__).parent / 'public' / 'data'
OUTPUT_FILE = DATA_DIR / 'idx_new.csv'
CSV_PATH = DATA_DIR / 'idx.csv'
START_DATE = '2024-05-17'
END_DATE = datetime.now().strftime('%Y-%m-%d')

def get_unique_tickers(limit=None):
    """Get unique tickers from existing CSV"""
    tickers = []
    seen = set()
    count = 0
    
    with open(CSV_PATH, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = row['Ticker']
            if ticker not in seen:
                tickers.append(ticker)
                seen.add(ticker)
                count += 1
                if limit and count >= limit:
                    break
    
    return tickers

def scrape_ticker(ticker):
    """Download data for a single ticker"""
    try:
        data = yf.download(f"{ticker}.JK", start=START_DATE, end=END_DATE, progress=False)
        return data if data is not None and len(data) > 0 else None
    except:
        return None

def save_to_csv(output_path, all_data):
    """Save scraped data to CSV"""
    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'])
        writer.writeheader()
        writer.writerows(all_data)

def main():
    print(f"Scraping data from {START_DATE} to {END_DATE}")
    print(f"Output file: {OUTPUT_FILE}\n")
    
    if not CSV_PATH.exists():
        print(f"Error: CSV file not found at {CSV_PATH}")
        return
    
    tickers = get_unique_tickers()
    print(f"Found {len(tickers)} unique tickers\n")
    
    all_rows = []
    success_count = 0
    fail_count = 0
    
    for i, ticker in enumerate(tickers, 1):
        data = scrape_ticker(ticker)
        
        if data is not None and len(data) > 0:
            data_reset = data.reset_index()
            
            for idx, row in data_reset.iterrows():
                try:
                    date_str = str(row['Date']).split()[0] if 'Date' in row else None
                    if date_str:
                        all_rows.append({
                            'Date': date_str,
                            'Ticker': ticker,
                            'Open': float(row['Open'].iloc[0]) if hasattr(row['Open'], 'iloc') else float(row['Open']),
                            'High': float(row['High'].iloc[0]) if hasattr(row['High'], 'iloc') else float(row['High']),
                            'Low': float(row['Low'].iloc[0]) if hasattr(row['Low'], 'iloc') else float(row['Low']),
                            'Close': float(row['Close'].iloc[0]) if hasattr(row['Close'], 'iloc') else float(row['Close']),
                            'Adj Close': float((row.get('Adj Close') or row['Close']).iloc[0]) if hasattr((row.get('Adj Close') or row['Close']), 'iloc') else float(row.get('Adj Close', row['Close'])),
                            'Volume': int((row['Volume'].iloc[0]) if hasattr(row['Volume'], 'iloc') else row['Volume'])
                        })
                except:
                    pass
            
            success_count += 1
            if i % 50 == 0:
                print(f"Progress: {i}/{len(tickers)} | Success: {success_count} | Rows: {len(all_rows)}")
        else:
            fail_count += 1
    
    # Save to separate file
    if all_rows:
        save_to_csv(OUTPUT_FILE, all_rows)
        print(f"\n[SUCCESS] Saved {len(all_rows)} rows to {OUTPUT_FILE}")
    else:
        print("\n[ERROR] No data scraped")
    
    print(f"Summary: {success_count} tickers scraped, {fail_count} failed")
    print("Done!")

if __name__ == '__main__':
    main()
