#!/usr/bin/env python3
"""
Test version of the Kaggle scraper using local files
This is the same script but configured to run locally first
"""

import csv
import yfinance as yf
from datetime import datetime
from pathlib import Path
import pandas as pd
import warnings

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore', category=FutureWarning)

# ============================================================================
# CONFIGURATION - LOCAL TEST VERSION
# ============================================================================

# Use local paths for testing
INPUT_CSV = Path(__file__).parent / 'public' / 'data' / 'idx_tickers.csv'
OUTPUT_CSV = Path(__file__).parent / 'public' / 'data' / 'idx_test_output.csv'

# Scraping parameters
START_DATE = '2024-05-17'
END_DATE = datetime.now().strftime('%Y-%m-%d')

print("=" * 70)
print("IDX Stock Data Scraper - LOCAL TEST")
print("=" * 70)
print(f"Start Date: {START_DATE}")
print(f"End Date: {END_DATE}")
print(f"Input File: {INPUT_CSV}")
print(f"Output File: {OUTPUT_CSV}")
print("=" * 70)

# ============================================================================
# READ TICKERS FROM CSV
# ============================================================================

def load_unique_tickers(csv_path, limit=None):
    """Load unique tickers from CSV file"""
    tickers = []
    seen = set()
    count = 0
    
    try:
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ticker = row.get('Ticker', '').strip()
                if ticker and ticker not in seen:
                    tickers.append(ticker)
                    seen.add(ticker)
                    count += 1
                    if limit and count >= limit:
                        break
    except FileNotFoundError:
        print(f"ERROR: File not found: {csv_path}")
        return []
    
    return tickers

print("\n" + "=" * 70)
print("STEP 1: Loading Tickers from CSV")
print("=" * 70)

tickers = load_unique_tickers(INPUT_CSV)
print(f"✓ Loaded {len(tickers)} unique tickers")
print(f"\nFirst 10 tickers: {tickers[:10]}")
print(f"Last 10 tickers: {tickers[-10:]}")

# ============================================================================
# SCRAPE DATA FROM YAHOO FINANCE
# ============================================================================

def scrape_ticker_data(ticker, start_date, end_date):
    """Download historical data for a single ticker"""
    try:
        data = yf.download(
            f"{ticker}.JK",
            start=start_date,
            end=end_date,
            progress=False
        )
        return data if data is not None and len(data) > 0 else None
    except Exception as e:
        return None


def format_row_data(ticker, row):
    """Convert a row to proper format"""
    try:
        # Handle different column types
        open_val = float(row['Open'].iloc[0]) if hasattr(row['Open'], 'iloc') else float(row['Open'])
        high_val = float(row['High'].iloc[0]) if hasattr(row['High'], 'iloc') else float(row['High'])
        low_val = float(row['Low'].iloc[0]) if hasattr(row['Low'], 'iloc') else float(row['Low'])
        close_val = float(row['Close'].iloc[0]) if hasattr(row['Close'], 'iloc') else float(row['Close'])
        adj_close_val = float((row.get('Adj Close') or row['Close']).iloc[0]) if hasattr((row.get('Adj Close') or row['Close']), 'iloc') else float(row.get('Adj Close', row['Close']))
        volume_val = int(row['Volume'].iloc[0]) if hasattr(row['Volume'], 'iloc') else int(row['Volume'])
        
        return {
            'Open': open_val,
            'High': high_val,
            'Low': low_val,
            'Close': close_val,
            'Adj Close': adj_close_val,
            'Volume': volume_val
        }
    except:
        return None


print("\n" + "=" * 70)
print("STEP 2: Scraping Data from Yahoo Finance")
print("=" * 70)
print(f"This will take some time. Processing {len(tickers)} tickers...\n")

all_rows = []
success_count = 0
fail_count = 0
total_data_rows = 0

for i, ticker in enumerate(tickers, 1):
    data = scrape_ticker_data(ticker, START_DATE, END_DATE)
    
    if data is not None and len(data) > 0:
        data_reset = data.reset_index()
        
        for idx, row in data_reset.iterrows():
            try:
                date_str = str(row['Date']).split()[0] if 'Date' in row else None
                if date_str:
                    row_data = format_row_data(ticker, row)
                    if row_data:
                        all_rows.append({
                            'Date': date_str,
                            'Ticker': ticker,
                            **row_data
                        })
                        total_data_rows += 1
            except:
                pass
        
        success_count += 1
    else:
        fail_count += 1
    
    # Show progress
    if i % 50 == 0 or i == len(tickers):
        print(f"Progress: {i}/{len(tickers)} tickers | Success: {success_count} | "
              f"Failed: {fail_count} | Total rows: {total_data_rows}")


# ============================================================================
# SAVE TO CSV FILE
# ============================================================================

def save_to_csv(output_path, data):
    """Save data to CSV file"""
    if not data:
        print("ERROR: No data to save")
        return False
    
    try:
        with open(output_path, 'w', newline='') as f:
            fieldnames = ['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        return True
    except Exception as e:
        print(f"ERROR saving to CSV: {e}")
        return False


print("\n" + "=" * 70)
print("STEP 3: Saving Data to CSV")
print("=" * 70)

if save_to_csv(OUTPUT_CSV, all_rows):
    print(f"✓ Successfully saved {len(all_rows)} rows to {OUTPUT_CSV}")
else:
    print("ERROR: Failed to save CSV file")


# ============================================================================
# SUMMARY STATISTICS
# ============================================================================

print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
print(f"Total tickers processed: {len(tickers)}")
print(f"Successful: {success_count}")
print(f"Failed: {fail_count}")
print(f"Total data rows scraped: {len(all_rows)}")

if all_rows:
    df = pd.DataFrame(all_rows)
    print(f"\nDate range: {df['Date'].min()} to {df['Date'].max()}")
    print(f"Unique dates: {df['Date'].nunique()}")
    print(f"Unique tickers with data: {df['Ticker'].nunique()}")
    print(f"\nFirst few rows:")
    print(df.head(10).to_string(index=False))
    print(f"\nOutput file size: {len(all_rows)} rows")

print("\n" + "=" * 70)
print("TEST COMPLETE!")
print("=" * 70)
print(f"Output saved to: {OUTPUT_CSV}")
print("If test is successful, use kaggle_scraper.py for Kaggle")
