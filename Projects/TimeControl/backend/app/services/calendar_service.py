from datetime import date, timedelta
from typing import Dict, List, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar_day import CalendarDay, DayType


LATVIAN_HOLIDAYS = {
    (1, 1): ("Новый год", "Jaunais gads", "New Year's Day"),
    (5, 1): ("День труда", "Darba svētki", "Labour Day"),
    (5, 4): ("День независимости", "Latvijas Republikas Neatkarības atjaunošanas diena", "Independence Restoration Day"),
    (6, 23): ("Лиго", "Līgo diena", "Midsummer Eve"),
    (6, 24): ("Янов день", "Jāņu diena", "Midsummer Day"),
    (11, 18): ("День провозглашения Латвийской Республики", "Latvijas Republikas proklamēšanas diena", "Proclamation Day"),
    (12, 24): ("Рождественский сочельник", "Ziemassvētku vakars", "Christmas Eve"),
    (12, 25): ("Рождество", "Ziemassvētki", "Christmas Day"),
    (12, 26): ("Второй день Рождества", "Otrie Ziemassvētki", "Second Day of Christmas"),
    (12, 31): ("Канун Нового года", "Vecgada diena", "New Year's Eve"),
}


def calculate_easter(year: int) -> date:
    """Calculate Easter Sunday for the given year."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def get_easter_related_holidays(year: int) -> Dict[date, tuple]:
    """Get Easter-related holidays for Latvia."""
    easter = calculate_easter(year)
    return {
        easter - timedelta(days=2): ("Страстная пятница", "Lielā Piektdiena", "Good Friday"),
        easter: ("Пасха", "Lieldienas", "Easter Sunday"),
        easter + timedelta(days=1): ("Пасхальный понедельник", "Otrās Lieldienas", "Easter Monday"),
    }


def get_bridge_days(year: int) -> Dict[date, tuple]:
    """Get substitute holidays when an official holiday lands on a weekend."""
    bridge_days: Dict[date, tuple] = {}

    for (month, day), names in LATVIAN_HOLIDAYS.items():
        holiday_date = date(year, month, day)
        weekday = holiday_date.weekday()

        if weekday == 5:
            bridge_date = holiday_date - timedelta(days=1)
            bridge_days[bridge_date] = (
                f"Выходной за {names[0]}",
                f"Brīvdiena par {names[1]}",
                f"Day off for {names[2]}",
            )
        elif weekday == 6:
            bridge_date = holiday_date + timedelta(days=1)
            bridge_days[bridge_date] = (
                f"Выходной за {names[0]}",
                f"Brīvdiena par {names[1]}",
                f"Day off for {names[2]}",
            )

    easter_holidays = get_easter_related_holidays(year)
    for holiday_date, names in easter_holidays.items():
        weekday = holiday_date.weekday()
        if weekday == 5:
            bridge_date = holiday_date - timedelta(days=1)
            bridge_days.setdefault(
                bridge_date,
                (
                    f"Выходной за {names[0]}",
                    f"Brīvdiena par {names[1]}",
                    f"Day off for {names[2]}",
                ),
            )
        elif weekday == 6:
            bridge_date = holiday_date + timedelta(days=1)
            if bridge_date not in easter_holidays:
                bridge_days.setdefault(
                    bridge_date,
                    (
                        f"Выходной за {names[0]}",
                        f"Brīvdiena par {names[1]}",
                        f"Day off for {names[2]}",
                    ),
                )

    return bridge_days


def classify_calendar_date(
    target_date: date,
    easter_holidays: Optional[Dict[date, tuple]] = None,
    bridge_days: Optional[Dict[date, tuple]] = None,
) -> Dict[str, object]:
    """Build normalized calendar metadata for a specific date."""
    if easter_holidays is None:
        easter_holidays = get_easter_related_holidays(target_date.year)
    if bridge_days is None:
        bridge_days = get_bridge_days(target_date.year)

    weekday = target_date.weekday()
    month_day = (target_date.month, target_date.day)

    if weekday >= 5:
        names = LATVIAN_HOLIDAYS.get(month_day)
        return {
            "day_type": DayType.WEEKEND,
            "holiday_name": names[0] if names else None,
            "holiday_name_lv": names[1] if names else None,
            "holiday_name_en": names[2] if names else None,
            "is_working_day": False,
            "country": "LV",
        }

    if month_day in LATVIAN_HOLIDAYS:
        names = LATVIAN_HOLIDAYS[month_day]
        return {
            "day_type": DayType.HOLIDAY,
            "holiday_name": names[0],
            "holiday_name_lv": names[1],
            "holiday_name_en": names[2],
            "is_working_day": False,
            "country": "LV",
        }

    if target_date in easter_holidays:
        names = easter_holidays[target_date]
        return {
            "day_type": DayType.HOLIDAY,
            "holiday_name": names[0],
            "holiday_name_lv": names[1],
            "holiday_name_en": names[2],
            "is_working_day": False,
            "country": "LV",
        }

    if target_date in bridge_days:
        names = bridge_days[target_date]
        return {
            "day_type": DayType.HOLIDAY,
            "holiday_name": names[0],
            "holiday_name_lv": names[1],
            "holiday_name_en": names[2],
            "is_working_day": False,
            "country": "LV",
        }

    return {
        "day_type": DayType.WORKDAY,
        "holiday_name": None,
        "holiday_name_lv": None,
        "holiday_name_en": None,
        "is_working_day": True,
        "country": "LV",
    }


class CalendarService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_day(self, target_date: date) -> Optional[CalendarDay]:
        result = await self.db.execute(select(CalendarDay).where(CalendarDay.date == target_date))
        return result.scalar_one_or_none()

    async def get_month(self, year: int, month: int) -> List[CalendarDay]:
        start_date = date(year, month, 1)
        end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

        await self.ensure_days_exist(start_date, end_date - timedelta(days=1))

        result = await self.db.execute(
            select(CalendarDay)
            .where(and_(CalendarDay.date >= start_date, CalendarDay.date < end_date))
            .order_by(CalendarDay.date)
        )
        return list(result.scalars().all())

    async def get_range(self, start_date: date, end_date: date) -> List[CalendarDay]:
        await self.ensure_days_exist(start_date, end_date)

        result = await self.db.execute(
            select(CalendarDay)
            .where(and_(CalendarDay.date >= start_date, CalendarDay.date <= end_date))
            .order_by(CalendarDay.date)
        )
        return list(result.scalars().all())

    async def get_working_days(self, start_date: date, end_date: date) -> List[CalendarDay]:
        await self.ensure_days_exist(start_date, end_date)

        result = await self.db.execute(
            select(CalendarDay)
            .where(
                and_(
                    CalendarDay.date >= start_date,
                    CalendarDay.date <= end_date,
                    CalendarDay.is_working_day == True,
                )
            )
            .order_by(CalendarDay.date)
        )
        return list(result.scalars().all())

    async def ensure_days_exist(self, start_date: date, end_date: date) -> None:
        result = await self.db.execute(
            select(CalendarDay).where(and_(CalendarDay.date >= start_date, CalendarDay.date <= end_date))
        )
        existing_days = {day.date: day for day in result.scalars().all()}

        years = set(range(start_date.year, end_date.year + 1))
        easter_holidays: Dict[date, tuple] = {}
        bridge_days: Dict[date, tuple] = {}
        for year in years:
            easter_holidays.update(get_easter_related_holidays(year))
            bridge_days.update(get_bridge_days(year))

        current_date = start_date
        while current_date <= end_date:
            payload = classify_calendar_date(current_date, easter_holidays, bridge_days)
            existing_day = existing_days.get(current_date)

            if existing_day is None:
                self.db.add(CalendarDay(date=current_date, **payload))
            else:
                for field, value in payload.items():
                    if getattr(existing_day, field) != value:
                        setattr(existing_day, field, value)
            current_date += timedelta(days=1)

        await self.db.flush()

    async def is_working_day(self, target_date: date) -> bool:
        day = await self.get_day(target_date)
        if day:
            return day.is_working_day

        await self.ensure_days_exist(target_date, target_date)
        day = await self.get_day(target_date)
        return day.is_working_day if day else False

    async def get_last_n_working_days(self, from_date: date, n: int) -> List[date]:
        working_days: List[date] = []
        current_date = from_date
        max_days_back = 60
        days_checked = 0

        while len(working_days) < n and days_checked < max_days_back:
            if await self.is_working_day(current_date):
                working_days.append(current_date)
            current_date -= timedelta(days=1)
            days_checked += 1

        return working_days
