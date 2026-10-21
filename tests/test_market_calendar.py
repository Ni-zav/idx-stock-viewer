import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from market_calendar import exchange_day, latest_expected_exchange_date, verified_calendar_year
from datetime import date


class IDXCalendarTests(unittest.TestCase):
    def test_idx_2026_closures(self):
        self.assertTrue(verified_calendar_year(2026))
        self.assertFalse(verified_calendar_year(2027))
        for day in ["2026-03-24", "2026-08-17", "2026-12-31"]:
            self.assertFalse(exchange_day(date.fromisoformat(day)))
        self.assertTrue(exchange_day(date(2026, 10, 21)))
        self.assertFalse(exchange_day(date(2026, 10, 24)))

    def test_last_expected_trading_date_around_long_holiday(self):
        zone = ZoneInfo("Asia/Jakarta")
        self.assertEqual(latest_expected_exchange_date(
            datetime(2026, 3, 25, 8, 30, tzinfo=zone)), "2026-03-17")
        self.assertEqual(latest_expected_exchange_date(
            datetime(2026, 3, 25, 10, 0, tzinfo=zone)), "2026-03-25")


if __name__ == "__main__":
    unittest.main()
