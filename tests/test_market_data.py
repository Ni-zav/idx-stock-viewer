import csv
import tempfile
import unittest
from pathlib import Path
from market_data import upsert_market_csv, valid_market_row


def sample(**overrides):
    row = {
        "Date": "2026-10-21 02:00:00", "Ticker": "BBCA",
        "Open": 8000, "High": 8050, "Low": 7900,
        "Close": 8010, "Adj Close": 8010, "Volume": 100,
    }
    row.update(overrides)
    return row


class MarketDataTests(unittest.TestCase):
    def test_valid_candle_and_impossible_prices(self):
        self.assertTrue(valid_market_row(sample()))
        self.assertTrue(valid_market_row(sample(Date="2026-10-21")))
        self.assertFalse(valid_market_row(sample(High=7000)))
        self.assertFalse(valid_market_row(sample(Close=float("nan"))))
        self.assertFalse(valid_market_row(sample(Volume=-1)))
        self.assertFalse(valid_market_row(sample(Date="2026-02-30")))
        self.assertFalse(valid_market_row(sample(Ticker="../../x")))

    def test_revision_is_persisted_even_without_new_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "BBCA.csv"
            self.assertEqual(upsert_market_csv(path, [sample()]), (1, 0))
            self.assertEqual(upsert_market_csv(path, [sample(Close=8020)]), (0, 1))
            self.assertEqual(upsert_market_csv(path, [sample(Close=8020)]), (0, 0))
            with path.open(newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 1)
            self.assertEqual(float(rows[0]["Close"]), 8020)

    def test_rejects_invalid_updates_without_dropping_good_history(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "BBCA.csv"
            upsert_market_csv(path, [sample()])
            self.assertEqual(upsert_market_csv(path, [sample(Close=-1)]), (0, 0))
            with path.open(newline="") as handle:
                self.assertEqual(len(list(csv.DictReader(handle))), 1)

    def test_sorts_and_deduplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "BBCA.csv"
            self.assertEqual(upsert_market_csv(path, [
                sample(Date="2026-10-22", Close=8010),
                sample(Date="2026-10-21", Close=8000),
                sample(Date="2026-10-21", Close=8010),
            ]), (2, 1))
            with path.open(newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual([r["Date"] for r in rows], ["2026-10-21", "2026-10-22"])
            self.assertEqual(float(rows[0]["Close"]), 8010)


if __name__ == "__main__":
    unittest.main()
