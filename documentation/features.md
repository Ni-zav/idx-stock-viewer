# 🌟 Key Features

The IDX Stock Viewer is designed to provide a premium, Bloomberg Terminal-like experience for analyzing Indonesian Stock Exchange data.

## 📊 Professional Charting System
- **Lightweight Charts Integration**: High-performance charting using TradingView's library.
- **Multiple Timeframes**: 
  - **Intraday**: 1m, 2m, 3m, 4m, 5m, 10m, 15m, 20m, 30m, 1h, 2h, 3h, 4h.
  - **Standard**: Daily, Weekly, Monthly, Yearly.
  - **Custom**: User-defined "N-day" aggregation.
- **Dynamic Gap Filling**: Toggleable feature to fill non-trading gaps (weekends, holidays) for a continuous timeline.
- **Volume Histogram**: Accurate volume display with color-coded bars matching candle direction.
- **Crosshair & Tooltips**: Precise price and volume inspection at any point.

## 🔴 Real-Time Streaming
- **WebSocket Backend**: Low-latency price updates pushed directly to the browser.
- **Smart Throttling**: 
  - 1-minute data updates continuously.
  - 5-minute data updates every 60 seconds.
  - 1-hour data updates every 5 minutes.
- **Visual Feedback**:
  - Green/Red flash animations on price changes.
  - Pulsing indicators for active connections.
  - Live price labels in sidebars and dashboards.
- **Background Fetching**: Automatically rotates through all market tickers to keep the entire dataset fresh.

## 📈 Advanced Dashboard
- **Market Overview**: Real-time view of all tracked tickers.
- **Sortable Metrics**: Sort by ticker, price, change, or percentage.
- **Sparkline Trends**: (Planned/Prototyped) Visual trend indicators for recent price action.
- **Instant Filtering**: Fuzzy search to find tickers instantly across the 900+ IDX listings.

## 🔄 Intelligent Data Management
- **Smart Update Logic**: Prioritizes the currently selected ticker while updating others in the background.
- **Incremental Sync**: Only downloads missing data since the last update to save bandwidth and time.
- **Split CSV Architecture**: Data is stored in individual ticker files, allowing the app to load years of history in milliseconds.
- **Data Cleanup Utility**: automated scripts to remove duplicates and fix formatting issues in CSV files.

## 🎨 Professional Design (Bloomberg Style)
- **Dark Mode Optimized**: High-contrast amber/green/red theme designed for long-term monitoring.
- **Responsive Layout**: Seamless transition between dashboard and detailed chart views.
- **Virtual Scrolling**: High-performance sidebar that remains smooth even with 1,000+ items.
