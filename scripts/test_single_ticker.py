#!/usr/bin/env python3
"""
Test the Kaggle scraper with just ONE ticker to verify the fix
"""

import csv
import yfinance as yf
from datetime import datetime
from pathlib import Path
import pandas as pd
import warnings

# Suppress warnings
warnings.filterwarnings('ignore', category=FutureWarning)

# Settings
OUTPUT_FILE = Path(__file__).parent / 'public' / 'data' / 'test_single_ticker.csv'
START_DATE = '2024-05-17'
END_DATE = datetime.now().strftime('%Y-%m-%d')
TEST_TICKER = 'AALI'  # Test with just AALI

print("=" * 70)
print(f"Testing Kaggle Scraper - Single Ticker: {TEST_TICKER}")
print("=" * 70)
print(f"Date Range: {START_DATE} to {END_DATE}")
print(f"Output: {OUTPUT_FILE}\n")

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
        print(f"Error downloading {ticker}: {e}")
        return None

def extract_row_values(row):
    """Extract individual values from a row"""
    try:
        open_val = float(row['Open'].iloc[0] if hasattr(row['Open'], 'iloc') else row['Open'])
        high_val = float(row['High'].iloc[0] if hasattr(row['High'], 'iloc') else row['High'])
        low_val = float(row['Low'].iloc[0] if hasattr(row['Low'], 'iloc') else row['Low'])
        close_val = float(row['Close'].iloc[0] if hasattr(row['Close'], 'iloc') else row['Close'])
        
        adj_close = row.get('Adj Close', row['Close'])
        adj_close_val = float(adj_close.iloc[0] if hasattr(adj_close, 'iloc') else adj_close)
        
        volume_val = int(row['Volume'].iloc[0] if hasattr(row['Volume'], 'iloc') else row['Volume'])
        
        return {
            'Open': open_val,
            'High': high_val,
            'Low': low_val,
            'Close': close_val,
            'Adj Close': adj_close_val,
            'Volume': volume_val
        }
    except Exception as e:
        print(f"Error extracting values: {e}")
        return None

# Download data
print(f"Downloading {TEST_TICKER}...")
data = scrape_ticker_data(TEST_TICKER, START_DATE, END_DATE)

if data is None or len(data) == 0:
    print(f"No data found for {TEST_TICKER}")
    exit(1)

print(f"Downloaded {len(data)} rows\n")

# Show raw DataFrame structure
print("Raw DataFrame info:")
print(f"Columns: {list(data.columns)}")
print(f"Index: {data.index.name}")
print("\nFirst 3 rows (raw):")
print(data.head(3))
print()

# Reset index and process
data_reset = data.reset_index()
print(f"After reset_index, columns: {list(data_reset.columns)}\n")

# Handle MultiIndex columns - flatten them
if isinstance(data_reset.columns, pd.MultiIndex):
    print("Detected MultiIndex columns, flattening...")
    data_reset.columns = ['_'.join(col).strip('_') if col[1] else col[0] for col in data_reset.columns.values]
    print(f"Flattened columns: {list(data_reset.columns)}\n")

# Rename columns to standard names
col_mapping = {}
for col in data_reset.columns:
    col_lower = str(col).lower()
    if 'date' in col_lower:
        col_mapping[col] = 'Date'
    elif 'open' in col_lower:
        col_mapping[col] = 'Open'
    elif 'high' in col_lower:
        col_mapping[col] = 'High'
    elif 'low' in col_lower:
        col_mapping[col] = 'Low'
    elif 'close' in col_lower and 'adj' not in col_lower:
        col_mapping[col] = 'Close'
    elif 'adj' in col_lower or ('close' in col_lower and 'adj' in col_lower):
        col_mapping[col] = 'Adj Close'
    elif 'volume' in col_lower:
        col_mapping[col] = 'Volume'

print(f"Column mapping: {col_mapping}\n")
data_reset = data_reset.rename(columns=col_mapping)
print(f"After rename, columns: {list(data_reset.columns)}\n")

# Process rows
all_rows = []
print("Processing rows...")

for idx, row in data_reset.iterrows():
    try:
        # Extract date
        if 'Date' in data_reset.columns:
            date_val = row['Date']
            if hasattr(date_val, 'strftime'):
                date_str = date_val.strftime('%Y-%m-%d')
            else:
                date_str = str(date_val).split()[0]
        else:
            print(f"ERROR: No 'Date' column found!")
            continue
        
        # Extract values
        row_data = extract_row_values(row)
        
        if row_data and date_str:
            all_rows.append({
                'Date': date_str,
                'Ticker': TEST_TICKER,
                **row_data
            })
    except Exception as e:
        print(f"Error processing row {idx}: {e}")
        continue

print(f"Processed {len(all_rows)} valid rows\n")

# Save to CSV
print("Saving to CSV...")
with open(OUTPUT_FILE, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'])
    writer.writeheader()
    writer.writerows(all_rows)

print(f"✓ Saved to {OUTPUT_FILE}\n")

# Show results
print("=" * 70)
print("SAMPLE OUTPUT (first 10 rows):")
print("=" * 70)
df = pd.DataFrame(all_rows)
print(df.head(10).to_string(index=False))

print("\n" + "=" * 70)
print("VERIFICATION:")
print("=" * 70)
print(f"Total rows: {len(all_rows)}")
print(f"Date range: {df['Date'].min()} to {df['Date'].max()}")
print(f"All rows have valid dates: {df['Date'].str.match(r'\\d{4}-\\d{2}-\\d{2}').all()}")
print("=" * 70)
