"""
Split idx.csv into individual per-ticker CSV files for faster loading.
Each ticker gets its own file in public/data/tickers/
"""

import os
import csv
from collections import defaultdict
from pathlib import Path

def split_csv_by_ticker():
    input_file = Path("public/data/idx.csv")
    output_dir = Path("public/data/tickers")
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Read and group data by ticker
    print(f"Reading {input_file}...")
    ticker_data = defaultdict(list)
    
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        
        for row in reader:
            ticker = row.get('Ticker', '').strip()
            if ticker:
                ticker_data[ticker].append(row)
    
    print(f"Found {len(ticker_data)} tickers")
    
    # Write each ticker to its own file, sorted by date
    for ticker, rows in ticker_data.items():
        # Sort by date
        rows.sort(key=lambda x: x.get('Date', ''))
        
        output_file = output_dir / f"{ticker}.csv"
        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)
        
        print(f"  Wrote {len(rows)} rows to {output_file.name}")
    
    print(f"\nDone! Created {len(ticker_data)} ticker files in {output_dir}")

if __name__ == "__main__":
    split_csv_by_ticker()
