#!/usr/bin/env python3
"""
Merge the new scraped data (idx_new.csv) into the original idx.csv
Run this after the scraper finishes to verify and merge the data
"""

import csv
from pathlib import Path

DATA_DIR = Path(__file__).parent / 'public' / 'data'
ORIGINAL_FILE = DATA_DIR / 'idx.csv'
NEW_FILE = DATA_DIR / 'idx_new.csv'
BACKUP_FILE = DATA_DIR / 'idx_backup.csv'

def merge_files():
    """Merge new data into original CSV"""
    
    if not NEW_FILE.exists():
        print(f"Error: {NEW_FILE} not found. Run scraper first.")
        return
    
    # Count rows in new file
    new_rows = 0
    with open(NEW_FILE, 'r') as f:
        new_rows = sum(1 for line in f) - 1  # exclude header
    
    print(f"New file has {new_rows} rows")
    print(f"Original file: {ORIGINAL_FILE}")
    print(f"New file: {NEW_FILE}")
    
    # Backup original
    print(f"\nBacking up original to {BACKUP_FILE}...")
    import shutil
    shutil.copy(ORIGINAL_FILE, BACKUP_FILE)
    
    # Read all data
    all_rows = []
    
    # Read original
    with open(ORIGINAL_FILE, 'r') as f:
        reader = csv.DictReader(f)
        all_rows.extend(reader)
    
    # Read new
    with open(NEW_FILE, 'r') as f:
        reader = csv.DictReader(f)
        all_rows.extend(reader)
    
    # Sort by date and ticker
    all_rows.sort(key=lambda x: (x['Date'], x['Ticker']))
    
    # Remove duplicates (keep first occurrence)
    seen = set()
    unique_rows = []
    for row in all_rows:
        key = (row['Date'], row['Ticker'])
        if key not in seen:
            seen.add(key)
            unique_rows.append(row)
    
    # Write merged file
    with open(ORIGINAL_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume'])
        writer.writeheader()
        writer.writerows(unique_rows)
    
    print(f"\n[SUCCESS] Merged {len(unique_rows)} total rows (removed {len(all_rows) - len(unique_rows)} duplicates)")
    print(f"Original file updated: {ORIGINAL_FILE}")
    print(f"Backup saved: {BACKUP_FILE}")

if __name__ == '__main__':
    merge_files()
