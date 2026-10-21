# IDX Stock Viewer

A local-first React + Express + Python viewer for Indonesian stock-market price history, with candlestick charts, dashboard statistics, and optional Yahoo Finance polling.

> **Data notice:** This application uses third-party Yahoo Finance observations, not a licensed real-time IDX market feed. Prices may be delayed, stale, missing, or revised. The chart now shows the most recent quote's source and observation time when streaming data is available.

## Quick start

Requires **Node.js 22.12+ (Vite 8)** and **Python 3.10+**.

```bash
npm ci
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/bootstrap.py --tickers BBCA BBRI BMRI TLKM
npm start
```

Open **http://localhost:5173** for the UI; the API listens on **http://127.0.0.1:3001**. The initial bootstrap downloads selected tickers from Yahoo Finance, then generates the dashboard JSON. Internet access and functioning Yahoo endpoints are required. If no data was downloaded, bootstrap exits with a clear error.

The `public/data/` directory contains locally generated prices, tickers, and dashboard artifacts and is intentionally untracked. A fresh checkout needs the bootstrap step; it is **not** shipped with the full IDX universe. Expand your tickers using `python fetch_tickers.py --add BBCA BBRI` followed by `python update_data.py` and `python generate_dashboard.py`.

## Development

```bash
npm test                    # Node regression tests: sessions, validation, timestamps
npm run build               # TypeScript checks + Vite build
npm run dev                 # Frontend only
npm run server              # API only
```

The API binds to loopback by default to avoid exposing scripts that modify local data. To opt in to remote access, set `HOST` and `CORS_ORIGIN` explicitly and add appropriate access controls **before** exposing the API outside a trusted network. Set frontend `VITE_API_URL` during build to point at that API. Exposing the server on the public internet without authentication is **not supported**.

Polling uses regular IDX continuous-trading sessions in the **Asia/Jakarta** timezone (Monday–Thursday 09:00–12:00 and 13:30–15:50; Friday 09:00–11:30 and 14:00–15:50). Pre/post-market auction phases and exchange holidays are not currently modeled. Check the [official IDX trading-hours page](https://www.idx.id/en/products-services/trading-hours-and-mechanism/) for the current schedule.

## Architecture

- **React + Vite:** candlesticks (Lightweight Charts), dashboard, intraday timeframes.
- **Express + WebSocket:** cache, streaming subscriptions, on-demand refresh.
- **Python + yfinance/pandas:** ticker downloads and local per-symbol CSV storage.
- **Source timestamp:** quotes include the original observation time, rather than falsely labeling each poll as a new live trade.

Additional documentation: [Features](documentation/features.md), [Architecture](documentation/architecture.md), [API](documentation/api.md), [Scripts](documentation/scripts.md).


## Corporate actions and adjusted prices

The chart offers two **explicitly labeled** daily history modes:
- **Yahoo Close (provider):** the OHLC data as returned by yfinance with `auto_adjust=False`. Yahoo may already adjust for some splits.
- **Yahoo Adj Close (daily+):** each historical OHLC is multiplied by that date's `Adj Close / Close` factor. Share volume remains unchanged. **This is not an independently audited corporate-action adjustment or a total-return index.** Intraday views always use provider OHLC.

To retrieve the source's declared dividend/split events (optional):

```bash
python scripts/sync_corporate_actions.py --tickers BBCA BBRI
```

The chart shows a collapsible event list if `public/data/actions/TICKER.json` exists. Every event is flagged as Yahoo-sourced and **not exchange-verified**. Event amounts depend on Yahoo's conventions; check official issuer and IDX disclosures before relying on them.

Yahoo's `end` parameter is exclusive. The batch downloader now requests **tomorrow's** date to include today's Jakarta trading date. To reconcile historical revisions after dividend/split changes:

```bash
python update_data.py --reconcile-days 30
python generate_dashboard.py
```

This reconciliation is bounded (0–365 days) and does **not** promise complete historical corporate-action accuracy. Source adjusted factors can change retroactively.

## Limitations and next improvements

- **2026 IDX holiday calendar:** the application uses published weekday exchange closures from IDX's Peng-00171/BEI.POP/09-2025 (see `config/idx-market-calendar.json`). The calendar includes 22 announced weekday closures and must be updated when the exchange publishes changes. Outside verified years, the API marks `calendarVerified: false` and applies a provisional weekdays-only schedule. Auctions are not modeled.
- **Provider freshness:** Yahoo observations are marked `recent`, `stale`, or `closed` depending on source timestamp and Jakarta session. Even `recent` is **not proof of exchange real-time access**, licensed quote latency, or data correctness; source latency remains unknown.
- Improve data ingestion validation, adjustments for stock splits, and corporate actions.
- Separate streaming workers from request-serving processes and persist cache metadata.
- End-to-end test actual market data and chart rendering.
- Add an authentication layer before offering a hosted multi-user version.
