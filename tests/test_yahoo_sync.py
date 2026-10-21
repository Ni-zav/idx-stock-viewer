import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
import pandas as pd

import update_data
from market_calendar import JAKARTA


def frame(date):
    index = pd.DatetimeIndex([pd.Timestamp(date)], name="Date")
    return pd.DataFrame([{
        "Open": 8000.0, "High": 8100.0, "Low": 7900.0,
        "Close": 8050.0, "Adj Close": 8000.0, "Volume": 120,
    }], index=index)


class DownloaderDateTests(unittest.TestCase):
    def test_yahoo_end_is_exclusive_and_includes_local_today(self):
        today = datetime.now(JAKARTA).date()
        with patch.object(update_data, "get_ticker_last_date", return_value=None), \
             patch.object(update_data, "update_ticker_file") as daily, \
             patch.object(update_data, "update_main_csv") as archive, \
             patch.object(update_data.yf, "download", return_value=frame(today)) as download:
            result = update_data.update_batch_tickers(["BBCA"])
        self.assertEqual(download.call_args.kwargs["end"], (today + timedelta(days=1)).isoformat())
        self.assertEqual(result[0]["status"], "updated")
        daily.assert_called_once()
        archive.assert_called_once()

    def test_reconciliation_includes_existing_date_for_revisions(self):
        today = datetime.now(JAKARTA).date()
        with patch.object(update_data, "get_ticker_last_date", return_value=today.isoformat()), \
             patch.object(update_data, "update_ticker_file") as daily, \
             patch.object(update_data, "update_main_csv"), \
             patch.object(update_data.yf, "download", return_value=frame(today)) as download:
            result = update_data.update_batch_tickers(["BBCA"], reconcile_days=7)
        self.assertEqual(result[0]["status"], "updated")
        self.assertEqual(download.call_args.kwargs["end"], (today + timedelta(days=1)).isoformat())
        daily.assert_called_once()


if __name__ == "__main__":
    unittest.main()
