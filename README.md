# IDX Stock Viewer 📊

A professional, high-performance stock data viewer for the Indonesian Stock Exchange (IDX). Built with a "Bloomberg Terminal" aesthetic, it combines real-time streaming with deep historical analysis.

## 📖 Documentation
Detailed guides are available in the `documentation/` folder:
- [**🌟 Features**](./documentation/features.md): Detailed look at charting, streaming, and dashboarding.
- [**🏗️ Architecture**](./documentation/architecture.md): System technical overview and data flow.
- [**🐍 Scripts Guide**](./documentation/scripts.md): Reference for all Python automation scripts.
- [**🌐 API Reference**](./documentation/api.md): Documentation for REST and WebSocket endpoints.

---

## 🚀 Key Features

- **📊 Bloomberg-Style Charts**: Candlestick charts with volume histograms via Lightweight Charts.
- **🔴 Real-Time Streaming**: Live price updates via WebSocket with flash animations.
- **⏱️ Granular Timeframes**: Support for 1m, 5m, 1h, Daily, Weekly, Monthly, and Custom (N-day) intervals.
- **🔄 Smart Syncing**: One-click incremental updates from Yahoo Finance.
- **🔍 Fast Dashboard**: Sortable overview of 900+ tickers with live price tracking.
- **⚡ High Performance**: Split-file CSV architecture ensures <100ms load times.

## 🛠️ Quick Start

### 1. Prerequisites
- **Node.js** 16+
- **Python** 3.8+ (with `.venv` configured)
- **Dependencies**: `pip install yfinance pandas`

### 2. Installation
```bash
# Install Node dependencies
npm install
```

### 3. Run the App
```bash
# Start both Frontend and API Server
npm start
```
- **Frontend**: `http://localhost:5173`
- **API Server**: `http://localhost:3001`

## 📦 Data Management

The system uses a highly optimized **per-ticker CSV storage** strategy:

- `public/data/idx_tickers.csv`: Ticker registry.
- `public/data/tickers/`: Historical daily data (AALI.csv, BBCA.csv, etc.).
- `public/data/intraday/`: Multi-interval intraday data (1m, 5m, 1h).

If you have a large monolithic CSV, split it using:
```bash
python split_tickers.py
```

## RED LATEST Updates (v1.1)
- **Bug Fix**: Improved streaming toggle logic to immediately kill stale Python processes and invalidate old sessions.
- **Documentation**: Comprehensive new documentation suite added to the `documentation/` directory.
- **Gap Filling**: New toggle to visualize or hide non-trading gaps in charts.

---

**Built with ❤️ for Indonesian stock market analysis**

