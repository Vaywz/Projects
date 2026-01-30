from datetime import date, timedelta
from typing import List, Dict, Optional
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.time_entry import TimeEntry, WorkplaceType
from app.models.day_status import DayStatus, StatusType
from app.models.calendar_day import CalendarDay
from app.schemas.stats import (
    PeriodType, StatsResponse, DailyStats, WeeklyStats, MonthlyStats
)
from .calendar_service import CalendarService
from .time_entry_service import TimeEntryService
from .day_status_service import DayStatusService


class StatsService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.calendar_service = CalendarService(db)
        self.time_entry_service = TimeEntryService(db)
        self.day_status_service = DayStatusService(db)

    async def get_stats(
        self,
        user_id: int,
        period: PeriodType,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None
    ) -> StatsResponse:
        """Get statistics for a user."""
        today = date.today()

        # Determine date range based on period
        if period == PeriodType.WEEK:
            # Current week (Monday to Sunday)
            start_of_week = today - timedelta(days=today.weekday())
            date_from = date_from or start_of_week
            date_to = date_to or (start_of_week + timedelta(days=6))
        elif period == PeriodType.MONTH:
            # Current month
            date_from = date_from or date(today.year, today.month, 1)
            if today.month == 12:
                next_month = date(today.year + 1, 1, 1)
            else:
                next_month = date(today.year, today.month + 1, 1)
            date_to = date_to or (next_month - timedelta(days=1))
        elif period == PeriodType.YEAR:
            # Current year
            date_from = date_from or date(today.year, 1, 1)
            date_to = date_to or date(today.year, 12, 31)
        else:
            # Custom period
            if not date_from or not date_to:
                raise ValueError("date_from and date_to are required for custom period")

        # Get all time entries for the period
        entries = await self.time_entry_service.get_user_entries_for_range(
            user_id, date_from, date_to
        )

        # Get all day statuses for the period
        statuses = await self.day_status_service.get_user_statuses_for_range(
            user_id, date_from, date_to
        )
        status_map = {s.date: s.status for s in statuses}

        # Get calendar days
        calendar_days = await self.calendar_service.get_range(date_from, date_to)
        calendar_map = {d.date: d for d in calendar_days}

        # Group entries by date
        entries_by_date: Dict[date, List[TimeEntry]] = {}
        for entry in entries:
            if entry.date not in entries_by_date:
                entries_by_date[entry.date] = []
            entries_by_date[entry.date].append(entry)

        # Calculate daily stats
        daily_stats = []
        total_minutes = 0
        total_break_minutes = 0
        working_days = 0
        days_with_entries = 0
        sick_days = 0
        vacation_days = 0
        office_days = 0
        remote_days = 0

        current = date_from
        while current <= date_to:
            cal_day = calendar_map.get(current)
            is_working = cal_day.is_working_day if cal_day else current.weekday() < 5
            day_status = status_map.get(current)

            day_entries = entries_by_date.get(current, [])
            day_minutes = sum(e.duration_minutes for e in day_entries)
            day_break = sum(e.break_minutes for e in day_entries)

            has_office = any(e.workplace == WorkplaceType.OFFICE for e in day_entries)
            has_remote = any(e.workplace == WorkplaceType.REMOTE for e in day_entries)

            # Calculate office/remote time
            office_minutes = sum(
                e.duration_minutes for e in day_entries
                if e.workplace == WorkplaceType.OFFICE
            )
            remote_minutes = sum(
                e.duration_minutes for e in day_entries
                if e.workplace == WorkplaceType.REMOTE
            )

            daily_stats.append(DailyStats(
                date=current,
                total_minutes=day_minutes,
                total_hours=round(day_minutes / 60, 2),
                break_minutes=day_break,
                office_minutes=office_minutes,
                remote_minutes=remote_minutes,
                status=day_status.value if day_status else None,
                is_working_day=is_working,
            ))

            # Aggregate stats
            total_minutes += day_minutes
            total_break_minutes += day_break

            if is_working:
                working_days += 1

            if day_entries:
                days_with_entries += 1
                if has_office:
                    office_days += 1
                if has_remote:
                    remote_days += 1

            if day_status == StatusType.SICK:
                sick_days += 1
            elif day_status == StatusType.VACATION:
                vacation_days += 1

            current += timedelta(days=1)

        # Calculate weekly stats if period spans multiple weeks
        weekly_stats = None
        if period in [PeriodType.MONTH, PeriodType.YEAR, PeriodType.CUSTOM]:
            weekly_stats = await self._calculate_weekly_stats(
                daily_stats, date_from, date_to
            )

        # Calculate monthly stats for year view
        monthly_stats = None
        if period == PeriodType.YEAR:
            monthly_stats = await self._calculate_monthly_stats(
                daily_stats, date_from, date_to
            )

        return StatsResponse(
            period=period,
            date_from=date_from,
            date_to=date_to,
            total_minutes=total_minutes,
            total_hours=round(total_minutes / 60, 2),
            total_break_minutes=total_break_minutes,
            working_days=working_days,
            days_with_entries=days_with_entries,
            sick_days=sick_days,
            vacation_days=vacation_days,
            office_days=office_days,
            remote_days=remote_days,
            daily_stats=daily_stats,
            weekly_stats=weekly_stats,
            monthly_stats=monthly_stats,
        )

    async def _calculate_weekly_stats(
        self,
        daily_stats: List[DailyStats],
        date_from: date,
        date_to: date
    ) -> List[WeeklyStats]:
        """Calculate weekly aggregated stats."""
        weekly_data: Dict[tuple, List[DailyStats]] = {}

        for day in daily_stats:
            year, week, _ = day.date.isocalendar()
            key = (year, week)
            if key not in weekly_data:
                weekly_data[key] = []
            weekly_data[key].append(day)

        weekly_stats = []
        for (year, week), days in sorted(weekly_data.items()):
            # Find week start and end
            first_day = min(d.date for d in days)
            week_start = first_day - timedelta(days=first_day.weekday())
            week_end = week_start + timedelta(days=6)

            total_minutes = sum(d.total_minutes for d in days)
            working_days = sum(1 for d in days if d.is_working_day)
            days_with_entries = sum(1 for d in days if d.total_minutes > 0)
            office_days = sum(1 for d in days if d.office_minutes > 0)
            remote_days = sum(1 for d in days if d.remote_minutes > 0)

            weekly_stats.append(WeeklyStats(
                week_number=week,
                year=year,
                start_date=week_start,
                end_date=week_end,
                total_minutes=total_minutes,
                total_hours=round(total_minutes / 60, 2),
                working_days=working_days,
                days_with_entries=days_with_entries,
                office_days=office_days,
                remote_days=remote_days,
            ))

        return weekly_stats

    async def _calculate_monthly_stats(
        self,
        daily_stats: List[DailyStats],
        date_from: date,
        date_to: date
    ) -> List[MonthlyStats]:
        """Calculate monthly aggregated stats."""
        monthly_data: Dict[tuple, List[DailyStats]] = {}

        for day in daily_stats:
            key = (day.date.year, day.date.month)
            if key not in monthly_data:
                monthly_data[key] = []
            monthly_data[key].append(day)

        monthly_stats = []
        for (year, month), days in sorted(monthly_data.items()):
            total_minutes = sum(d.total_minutes for d in days)
            working_days = sum(1 for d in days if d.is_working_day)
            days_with_entries = sum(1 for d in days if d.total_minutes > 0)
            sick_days = sum(1 for d in days if d.status == StatusType.SICK.value)
            vacation_days = sum(1 for d in days if d.status == StatusType.VACATION.value)
            office_days = sum(1 for d in days if d.office_minutes > 0)
            remote_days = sum(1 for d in days if d.remote_minutes > 0)

            monthly_stats.append(MonthlyStats(
                month=month,
                year=year,
                total_minutes=total_minutes,
                total_hours=round(total_minutes / 60, 2),
                working_days=working_days,
                days_with_entries=days_with_entries,
                sick_days=sick_days,
                vacation_days=vacation_days,
                office_days=office_days,
                remote_days=remote_days,
            ))

        return monthly_stats
