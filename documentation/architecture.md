# 🏗️ System Architecture

The IDX Stock Viewer is a 3-tier application designed for high-performance data visualization and efficient management of 900+ stock symbols.

## 1. Frontend (React + TypeScript)
- **Engine**: Vite for extremely fast development and bundling.
- **State Management**: React Hooks (useState, useEffect, useMemo, useCallback) for efficient UI updates.
- **Charting**: `lightweight-charts`. We use a custom wrapper to bridge CSV data into the chart format.
- **Communication**: 
  - REST for one-off commands (Update, Add Ticker).
  - WebSocket for real-time price streams.
  - Native `fetch` for loading static CSV data files.

## 2. API Gateway (Node.js/Express)
- **Role**: Serves as the orchestrator.
- **Process Management**: Uses `child_process.spawn` to run Python scripts asynchronously.
- **Real-Time**: Integrates `ws` (WebSocket) to broadcast price updates to multiple clients.
- **Session Tracking**: Tracks active Python processes to prevent resource leaks (e.g., when stopping streaming).

## 3. Data Engine (Python)
- **Role**: Heavy lifting, data science, and external API integration.
- **Integration**: `yfinance` is the primary library used to pull data from Yahoo Finance.
- **Persistence**: Flat-file CSV storage. 
  - Individual files per ticker for O(1) file access.
  - Mirrored folders for different intervals (1m, 5m, 1h, daily).

## 📁 Data Flow
1. **User requests a ticker**: Frontend fetches `/data/tickers/TICKER.csv`.
2. **User enables streaming**: 
   - Frontend sends `start` request to API.
   - API spawns `intraday_fetcher.py`.
   - Python script writes updates to CSV and returns clean JSON.
   - API broadcasts JSON via WebSocket.
   - Frontend updates the last candle and sidebar highlights.
3. **User triggers update**:
   - Frontend sends `update` command.
   - API spawns `update_data.py`.
   - Python script fetches missing data and updates CSVs.
   - Frontend polls progress and reloads data upon completion.
