from datetime import date, timedelta
from typing import List, Optional, Dict
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar_day import CalendarDay, DayType


# Latvian public holidays (fixed dates)
LATVIAN_HOLIDAYS = {
    # (month, day): (name_ru, name_lv, name_en)
    (1, 1): ("Новый год", "Jaunais gads", "New Year's Day"),
    (5, 1): ("День труда", "Darba svētki", "Labour Day"),
    (5, 4): ("День независимости", "Latvijas Republikas Neatkarības atjaunošanas diena", "Independence Restoration Day"),
    (6, 23): ("Лиго", "Līgo diena", "Midsummer Eve"),
    (6, 24): ("Янов день", "Jāņu diena", "Midsummer Day"),
    (11, 18): ("День провозглашения Латвийской республики", "Latvijas Republikas proklamēšanas diena", "Proclamation Day"),
    (12, 24): ("Рождественский сочельник", "Ziemassvētku vakars", "Christmas Eve"),
    (12, 25): ("Рождество", "Ziemassvētki", "Christmas Day"),
    (12, 26): ("Второй день Рождества", "Otrie Ziemassvētki", "Second Day of Christmas"),
    (12, 31): ("Канун Нового года", "Vecgada diena", "New Year's Eve"),
}


def calculate_easter(year: int) -> date:
    """Calculate Easter Sunday date for a given year using the Anonymous Gregorian algorithm."""
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
    """
    Get bridge days (дополнительные выходные) for Latvia.
    In Latvia, if a holiday falls on Saturday, Friday becomes a day off.
    If a holiday falls on Sunday, Monday becomes a day off.
    """
    bridge_days = {}

    # Check all fixed holidays
    for (month, day), names in LATVIAN_HOLIDAYS.items():
        try:
            holiday_date = date(year, month, day)
            weekday = holiday_date.weekday()

            if weekday == 5:  # Saturday - Friday becomes bridge day
                bridge_date = holiday_date - timedelta(days=1)
                bridge_days[bridge_date] = (
                    f"Выходной за {names[0]}",
                    f"Brīvdiena par {names[1]}",
                    f"Day off for {names[2]}"
                )
            elif weekday == 6:  # Sunday - Monday becomes bridge day
                bridge_date = holiday_date + timedelta(days=1)
                bridge_days[bridge_date] = (
                    f"Выходной за {names[0]}",
                    f"Brīvdiena par {names[1]}",
                    f"Day off for {names[2]}"
                )
        except ValueError:
            continue

    # Check Easter-related holidays (though Easter Sunday is always Sunday)
    easter_holidays = get_easter_related_holidays(year)
    for holiday_date, names in easter_holidays.items():
        weekday = holiday_date.weekday()
        if weekday == 5:  # Saturday
            bridge_date = holiday_date - timedelta(days=1)
            if bridge_date not in bridge_days:
                bridge_days[bridge_date] = (
                    f"Выходной за {names[0]}",
                    f"Brīvdiena par {names[1]}",
                    f"Day off for {names[2]}"
                )
        elif weekday == 6:  # Sunday
            bridge_date = holiday_date + timedelta(days=1)
            if bridge_date not in bridge_days and bridge_date not in easter_holidays:
                bridge_days[bridge_date] = (
                    f"Выходной за {names[0]}",
                    f"Brīvdiena par {names[1]}",
                    f"Day off for {names[2]}"
                )

    return bridge_days


class CalendarService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_day(self, target_date: date) -> Optional[CalendarDay]:
        """Get calendar day info."""
        result = await self.db.execute(
            select(CalendarDay).where(CalendarDay.date == target_date)
        )
        return result.scalar_one_or_none()

    async def get_month(self, year: int, month: int) -> List[CalendarDay]:
        """Get all calendar days for a month."""
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)

        # Ensure days exist
        await self.ensure_days_exist(start_date, end_date - timedelta(days=1))

        result = await self.db.execute(
            select(CalendarDay)
            .where(and_(
                CalendarDay.date >= start_date,
                CalendarDay.date < end_date
            ))
            .order_by(CalendarDay.date)
        )
        return list(result.scalars().all())

    async def get_range(self, start_date: date, end_date: date) -> List[CalendarDay]:
        """Get calendar days for a date range."""
        await self.ensure_days_exist(start_date, end_date)

        result = await self.db.execute(
            select(CalendarDay)
            .where(and_(
                CalendarDay.date >= start_date,
                CalendarDay.date <= end_date
            ))
            .order_by(CalendarDay.date)
        )
        return list(result.scalars().all())

    async def get_working_days(self, start_date: date, end_date: date) -> List[CalendarDay]:
        """Get only working days in a range."""
        await self.ensure_days_exist(start_date, end_date)

        result = await self.db.execute(
            select(CalendarDay)
            .where(and_(
                CalendarDay.date >= start_date,
                CalendarDay.date <= end_date,
                CalendarDay.is_working_day == True
            ))
            .order_by(CalendarDay.date)
        )
        return list(result.scalars().all())

    async def ensure_days_exist(self, start_date: date, end_date: date) -> None:
        """Ensure calendar days exist for the given range."""
        # Check existing days
        result = await self.db.execute(
            select(CalendarDay.date)
            .where(and_(
                CalendarDay.date >= start_date,
                CalendarDay.date <= end_date
            ))
        )
        existing_dates = set(row[0] for row in result.fetchall())

        # Get Easter holidays and bridge days for relevant years
        years = set(range(start_date.year, end_date.year + 1))
        easter_holidays = {}
        bridge_days = {}
        for year in years:
            easter_holidays.update(get_easter_related_holidays(year))
            bridge_days.update(get_bridge_days(year))

        # Create missing days
        current_date = start_date
        while current_date <= end_date:
            if current_date not in existing_dates:
                day = self._create_calendar_day(current_date, easter_holidays, bridge_days)
                self.db.add(day)
            current_date += timedelta(days=1)

        await self.db.flush()

    def _create_calendar_day(self, target_date: date, easter_holidays: Dict[date, tuple], bridge_days: Dict[date, tuple] = None) -> CalendarDay:
        """Create a calendar day entry."""
        if bridge_days is None:
            bridge_days = {}

        weekday = target_date.weekday()

        # Check if weekend
        if weekday >= 5:  # Saturday = 5, Sunday = 6
            # Check if it's also a holiday (for display purposes)
            month_day = (target_date.month, target_date.day)
            if month_day in LATVIAN_HOLIDAYS:
                names = LATVIAN_HOLIDAYS[month_day]
                return CalendarDay(
                    date=target_date,
                    day_type=DayType.WEEKEND,
                    holiday_name=names[0],
                    holiday_name_lv=names[1],
                    holiday_name_en=names[2],
                    is_working_day=False,
                    country="LV",
                )
            return CalendarDay(
                date=target_date,
                day_type=DayType.WEEKEND,
                is_working_day=False,
                country="LV",
            )

        # Check fixed holidays
        month_day = (target_date.month, target_date.day)
        if month_day in LATVIAN_HOLIDAYS:
            names = LATVIAN_HOLIDAYS[month_day]
            return CalendarDay(
                date=target_date,
                day_type=DayType.HOLIDAY,
                holiday_name=names[0],
                holiday_name_lv=names[1],
                holiday_name_en=names[2],
                is_working_day=False,
                country="LV",
            )

        # Check Easter-related holidays
        if target_date in easter_holidays:
            names = easter_holidays[target_date]
            return CalendarDay(
                date=target_date,
                day_type=DayType.HOLIDAY,
                holiday_name=names[0],
                holiday_name_lv=names[1],
                holiday_name_en=names[2],
                is_working_day=False,
                country="LV",
            )

        # Check bridge days (дополнительные выходные)
        if target_date in bridge_days:
            names = bridge_days[target_date]
            return CalendarDay(
                date=target_date,
                day_type=DayType.HOLIDAY,
                holiday_name=names[0],
                holiday_name_lv=names[1],
                holiday_name_en=names[2],
                is_working_day=False,
                country="LV",
            )

        # Regular workday
        return CalendarDay(
            date=target_date,
            day_type=DayType.WORKDAY,
            is_working_day=True,
            country="LV",
        )

    async def is_working_day(self, target_date: date) -> bool:
        """Check if a date is a working day."""
        day = await self.get_day(target_date)
        if day:
            return day.is_working_day

        # Create the day if it doesn't exist
        await self.ensure_days_exist(target_date, target_date)
        day = await self.get_day(target_date)
        return day.is_working_day if day else False

    async def get_last_n_working_days(self, from_date: date, n: int) -> List[date]:
        """Get the last N working days before (and including) from_date."""
        working_days = []
        current_date = from_date

        # Go back up to 30 days max to find N working days
        max_days_back = 60
        days_checked = 0

        while len(working_days) < n and days_checked < max_days_back:
            is_working = await self.is_working_day(current_date)
            if is_working:
                working_days.append(current_date)
            current_date -= timedelta(days=1)
            days_checked += 1

        return working_days
