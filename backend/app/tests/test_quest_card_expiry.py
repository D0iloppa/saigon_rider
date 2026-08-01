from datetime import datetime
from zoneinfo import ZoneInfo

from app.utils import quest_card_expires_at

ICT = ZoneInfo("Asia/Ho_Chi_Minh")


def test_daily_card_expires_at_next_ict_midnight():
    now = datetime(2026, 7, 22, 23, 59, 59, tzinfo=ICT)
    assert quest_card_expires_at("DAILY", None, now=now) == datetime(2026, 7, 23, tzinfo=ICT)


def test_weekly_card_expires_at_next_monday_ict_midnight():
    now = datetime(2026, 7, 22, 12, tzinfo=ICT)  # Wednesday
    assert quest_card_expires_at("WEEKLY", None, now=now) == datetime(2026, 7, 27, tzinfo=ICT)


def test_quest_end_wins_when_before_period_boundary():
    now = datetime(2026, 7, 22, 12, tzinfo=ICT)
    ends_at = datetime(2026, 7, 22, 18, tzinfo=ICT)
    assert quest_card_expires_at("DAILY", ends_at, now=now) == ends_at
