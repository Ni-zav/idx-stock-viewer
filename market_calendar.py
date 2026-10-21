"""IDX regular-equity calendar. Source and dated closure list are in config/.

Unknown years remain provisional. Scheduled closures may be superseded by IDX notices.
"""
import json
from datetime import datetime, timedelta, time
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

JAKARTA = ZoneInfo("Asia/Jakarta")
CALENDAR = Path(__file__).parent / "config" / "idx-market-calendar.json"


@lru_cache(maxsize=1)
def closure_calendar():
    with CALENDAR.open(encoding="utf-8") as f:
        raw = json.load(f)
    return {int(year): frozenset(days) for year, days in raw["holidaysByYear"].items()}


def exchange_day(day):
    dates = closure_calendar().get(day.year, frozenset())
    return day.weekday() < 5 and day.isoformat() not in dates


def verified_calendar_year(year):
    return year in closure_calendar()


def latest_expected_exchange_date(now=None):
    """Last expected trading date for data freshness checks.

    Before 09:00 WIB on an exchange day, yesterday's exchange day is the
    expected latest completed daily session. This is a *heuristic* while the
    day is open: provider delays and unscheduled exchange closures are possible.
    """
    now = now or datetime.now(tz=JAKARTA)
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    here = now.astimezone(JAKARTA)
    day = here.date()
    if here.time() < time(9):
        day -= timedelta(days=1)
    for _ in range(14):
        if exchange_day(day):
            return day.isoformat()
        day -= timedelta(days=1)
    raise RuntimeError("IDX calendar has no trading day in two weeks")
