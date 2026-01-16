# 🐍 Python Automation Scripts

The backend functionality is powered by a comprehensive suite of Python scripts for data fetching, processing, and maintenance.

## 📥 Fetching & Syncing

### `update_data.py`
The primary script for updating historical daily data.
- **Usage**: `python update_data.py [TICKER]`
- **Features**: Incremental updates, batch fetching, and CSV integration.

### `intraday_fetcher.py`
High-frequency fetcher for intraday candles.
- **Usage**: `python intraday_fetcher.py --batch TICKER1,TICKER2 --interval 1m`
- **Supported Intervals**: 1m, 5m, 30m, 1h.
- **Logic**: Handles Yahoo Finance limits and merges new candles into existing CSVs.

### `auto_sync.py`
Background daemon for keeping data fresh.
- **Logic**: Continuously checks for missing dates and triggers updates.

### `smart_update.py`
Prioritized update system.
- **Logic**: Speeds up updates for high-priority tickers (e.g., currently viewed) before processing the rest of the market.

## 🔍 Discovery & Scraping

### `discover_tickers.py` / `exhaustive_discovery.py`
Tools to find new IPOs or missing tickers on the IDX.
- **Logic**: Scans Yahoo Finance or other sources for valid `.JK` symbols.

### `kaggle_scraper.py`
Utility to import historical datasets from Kaggle.

### `scrape_data_fast.py`
Optimized multi-threaded scraper for initial bulk downloads.

## 🛠️ Data Management

### `split_tickers.py`
Converts a monolithic `idx.csv` into individual per-ticker files.
- **Why**: Dramatically improves frontend loading performance.

### `merge_files.py`
The inverse of `split_tickers.py`; combines individual files back into a master dataset.

### `data_cleanup.py`
Maintenance utility.
- **Features**: Removes duplicate rows, sorts by date, and fixes price outliers.

### `generate_dashboard.py`
Pre-calculates statistics (change %, last price) for all tickers to generate `dashboard.json`.
- **Purpose**: Powers the fast loading of the Dashboard view.

## 🧪 Testing

### `test_single_ticker.py`
Verifies data integrity and fetching for a single symbol.

### `test_kaggle_scraper.py`
Validates Kaggle integration logic without affecting main data.
