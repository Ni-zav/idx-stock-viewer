"""Integration fixtures verify that UTC observations are assigned to the IDX day."""
import csv
import json
import tempfile
import unittest
from pathlib import Path

import generate_dashboard


COLUMNS = ['Date', 'Ticker', 'Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume']


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def candle(date, price, volume):
    return dict(Date=date, Ticker='BBCA', Open=price, High=price + 10,
                Low=price - 10, Close=price, **{'Adj Close': price}, Volume=volume)


class DashboardIntegrationTests(unittest.TestCase):
    def test_intraday_utc_date_and_volume_match_jakarta_market_day(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = generate_dashboard.DATA_DIR, generate_dashboard.INTRADAY_DIR, generate_dashboard.OUTPUT_FILE
            try:
                generate_dashboard.DATA_DIR = str(root / 'tickers')
                generate_dashboard.INTRADAY_DIR = str(root / 'intraday')
                generate_dashboard.OUTPUT_FILE = str(root / 'dashboard.json')
                write_csv(root / 'tickers' / 'BBCA.csv', [
                    candle('2026-10-19', 7900, 100),
                    candle('2026-10-20', 8000, 200),
                ])
                write_csv(root / 'intraday' / 'BBCA.csv', [
                    candle('2026-10-20 17:30:00', 8010, 30),  # Oct 21 00:30 WIB
                    candle('2026-10-21 02:00:00', 8050, 80),  # Oct 21 09:00 WIB
                    candle('2026-10-21 03:00:00', 8030, 70),  # Oct 21 10:00 WIB
                ])
                generate_dashboard.generate_dashboard_data()
                item = json.loads(Path(generate_dashboard.OUTPUT_FILE).read_text())[0]
                self.assertEqual(item['t'], 'BBCA')
                self.assertEqual(item['p'], 8030)
                self.assertEqual(item['asOfDate'], '2026-10-21')
                self.assertEqual(item['observedAt'], '2026-10-21T03:00:00Z')
                self.assertEqual(item['source'], 'yahoo-intraday-1m')
                self.assertEqual(item['v'], 180)
                self.assertAlmostEqual(item['p1d'], 30)
            finally:
                (generate_dashboard.DATA_DIR,
                 generate_dashboard.INTRADAY_DIR,
                 generate_dashboard.OUTPUT_FILE) = old


if __name__ == '__main__':
    unittest.main()
