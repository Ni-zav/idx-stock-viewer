# 🌐 API Reference

The `api-server.js` serves as a bridge between the React frontend and the Python scripts, while also handling real-time WebSocket streaming.

## 📡 WebSocket Streaming
- **Endpoint**: `ws://localhost:3001/ws/stream`
- **Messages**:
  - `subscribe`: Send `{"type": "subscribe", "tickers": ["BBCA", "TLKM"]}` to start receiving live updates.
  - `unsubscribe`: Stop updates for specific or all tickers.
  - `live_price`: (Server -> Client) Returns `{"type": "live_price", ...}` with latest OHLVC data.

## 🛠️ Data Endpoints

### `POST /api/update`
Triggers the `update_data.py` script.
- **Body**: `{ "ticker": "BBCA" }` (optional)
- **Response**: Status and progress tracking ID.

### `POST /api/smart-update`
Runs the `smart_update.py` script with priority.
- **Body**: `{ "ticker": "BBCA", "priorityOnly": false }`

### `POST /api/streaming/start`
Enables the background streaming engine.
- **Body**: `{ "tickers": [...], "intervalMs": 10000 }`

### `POST /api/streaming/stop`
Disables streaming and kills active background processes.

### `POST /api/intraday/fetch`
Force-fetches intraday data for specific tickers.
- **Body**: `{ "tickers": [...], "interval": "1m" }`

### `POST /api/tickers/add`
Adds a new ticker to the system, downloads history, and updates the dashboard.
- **Body**: `{ "ticker": "AADI" }`

## 📊 Status & Info

### `GET /api/status`
Returns general status of all tickers (last date, update state).

### `GET /api/update/progress`
Polls the progress of the currently running Python script.

### `GET /api/streaming/status`
Returns whether streaming is active and how many clients are connected.

### `GET /api/ticker/:ticker/last-date`
Checks the latest available data date for a specific ticker directly via `update_data.py --check`.
