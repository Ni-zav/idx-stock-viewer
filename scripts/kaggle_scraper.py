"""
IDX Stock Data Scraper - Kaggle Compatible
==========================================
This script scrapes historical stock data from Yahoo Finance for Indonesian stocks
and saves it to a CSV file. Can be run on Kaggle.
"""

# ============================================================================
# 1. IMPORT LIBRARIES
# ============================================================================

import csv
import yfinance as yf
from datetime import datetime
from pathlib import Path
import pandas as pd
import warnings

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore', category=FutureWarning)


# ============================================================================
# 2. CONFIGURATION
# ============================================================================

# File paths - adjust for Kaggle environment
INPUT_CSV = '/kaggle/input/idx-tickers/idx_tickers.csv'  # Small file with just tickers
OUTPUT_CSV = '/kaggle/working/idx_new.csv'  # Kaggle output directory

# Scraping parameters
START_DATE = '2024-05-17'
END_DATE = datetime.now().strftime('%Y-%m-%d')

print("=" * 70)
print(f"IDX Stock Data Scraper")
print("=" * 70)
print(f"Start Date: {START_DATE}")
print(f"End Date: {END_DATE}")
print(f"Output File: {OUTPUT_CSV}")
print("=" * 70)


# ============================================================================
# 3. READ TICKERS FROM CSV
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
# 4. SCRAPE DATA FROM YAHOO FINANCE
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


def extract_row_values(row):
    """Extract individual values from a row, handling Series objects"""
    try:
        # Check if values are Series objects and extract them
        open_val = float(row['Open'].iloc[0] if hasattr(row['Open'], 'iloc') else row['Open'])
        high_val = float(row['High'].iloc[0] if hasattr(row['High'], 'iloc') else row['High'])
        low_val = float(row['Low'].iloc[0] if hasattr(row['Low'], 'iloc') else row['Low'])
        close_val = float(row['Close'].iloc[0] if hasattr(row['Close'], 'iloc') else row['Close'])
        
        # Handle Adj Close - use Close if Adj Close doesn't exist
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
        # Reset index to convert datetime index to column
        data_reset = data.reset_index()
        
        # Handle MultiIndex columns - flatten them
        if isinstance(data_reset.columns, pd.MultiIndex):
            data_reset.columns = ['_'.join(col).strip('_') if col[1] else col[0] for col in data_reset.columns.values]
        
        # Rename columns to standard names
        # Map the columns properly
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
        
        data_reset = data_reset.rename(columns=col_mapping)
        
        for idx, row in data_reset.iterrows():
            try:
                # Extract date properly
                if 'Date' in data_reset.columns:
                    date_val = row['Date']
                    # Convert to string format YYYY-MM-DD
                    if hasattr(date_val, 'strftime'):
                        date_str = date_val.strftime('%Y-%m-%d')
                    else:
                        date_str = str(date_val).split()[0]
                else:
                    # If Date is not in columns, skip this row
                    continue
                
                # Extract OHLCV values
                row_data = extract_row_values(row)
                
                if row_data and date_str:
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
# 5. SAVE TO CSV FILE
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
# 6. SUMMARY STATISTICS
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
print("DONE!")
print("=" * 70)
print(f"Output file: {OUTPUT_CSV}")
print("You can download this file and merge it with your original CSV.")
