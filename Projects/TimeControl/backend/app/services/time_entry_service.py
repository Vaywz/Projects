from datetime import date, time, timedelta
from typing import List, Optional, Union
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.time_entry import TimeEntry, WorkplaceType
from app.models.day_status import DayStatus, StatusType
from app.models.vacation import Vacation
from app.schemas.time_entry import TimeEntryCreate, TimeEntryUpdate, TimeEntryUpdateAdmin, DaySummary, TimeEntryResponse


class TimeEntryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, entry_id: int) -> Optional[TimeEntry]:
        """Get time entry by ID."""
        result = await self.db.execute(
            select(TimeEntry).where(TimeEntry.id == entry_id)
        )
        return result.scalar_one_or_none()

    async def get_user_entries_for_date(self, user_id: int, target_date: date) -> List[TimeEntry]:
        """Get all time entries for a user on a specific date."""
        result = await self.db.execute(
            select(TimeEntry)
            .where(and_(
                TimeEntry.user_id == user_id,
                TimeEntry.date == target_date
            ))
            .order_by(TimeEntry.start_time)
        )
        return list(result.scalars().all())

    async def get_total_break_for_date(self, user_id: int, target_date: date, exclude_id: Optional[int] = None) -> int:
        """Get total break minutes for a user on a specific date."""
        entries = await self.get_user_entries_for_date(user_id, target_date)
        return sum(e.break_minutes for e in entries if exclude_id is None or e.id != exclude_id)

    async def get_user_entries_for_range(
        self,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> List[TimeEntry]:
        """Get all time entries for a user in a date range."""
        result = await self.db.execute(
            select(TimeEntry)
            .where(and_(
                TimeEntry.user_id == user_id,
                TimeEntry.date >= start_date,
                TimeEntry.date <= end_date
            ))
            .order_by(TimeEntry.date, TimeEntry.start_time)
        )
        return list(result.scalars().all())

    async def get_day_summary(self, user_id: int, target_date: date) -> DaySummary:
        """Get summary of time entries for a day."""
        entries = await self.get_user_entries_for_date(user_id, target_date)

        total_minutes = 0
        total_break = 0
        has_office = False
        has_remote = False

        entry_responses = []
        for entry in entries:
            total_minutes += entry.duration_minutes
            total_break += entry.break_minutes
            if entry.workplace == WorkplaceType.OFFICE:
                has_office = True
            else:
                has_remote = True

            entry_responses.append(TimeEntryResponse(
                id=entry.id,
                user_id=entry.user_id,
                date=entry.date,
                start_time=entry.start_time,
                end_time=entry.end_time,
                break_minutes=entry.break_minutes,
                workplace=entry.workplace,
                comment=entry.comment,
                duration_minutes=entry.duration_minutes,
                duration_hours=entry.duration_hours,
                created_at=entry.created_at,
                updated_at=entry.updated_at,
            ))

        return DaySummary(
            date=target_date,
            entries=entry_responses,
            total_minutes=total_minutes,
            total_hours=round(total_minutes / 60, 2),
            total_break_minutes=total_break,
            has_office=has_office,
            has_remote=has_remote,
        )

    async def create(self, user_id: int, entry_data: TimeEntryCreate, admin_bypass: bool = False, payment_type: Optional[str] = None) -> TimeEntry:
        """Create a new time entry."""
        # Allow entries for current month + next month - skip for admin
        if not admin_bypass:
            today = date.today()
            # Calculate end of next month
            if today.month >= 11:
                next_month_end = date(today.year + 1, today.month - 10, 1) - timedelta(days=1)
            else:
                next_month_end = date(today.year, today.month + 2, 1) - timedelta(days=1)

            if entry_data.date > next_month_end:
                raise ValueError("Cannot create time entries beyond next month")

        # Check if date has vacation/sick/dayoff status
        day_status_result = await self.db.execute(
            select(DayStatus).where(and_(
                DayStatus.user_id == user_id,
                DayStatus.date == entry_data.date,
                DayStatus.status.in_([StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED, StatusType.DAYOFF])
            ))
        )
        if day_status_result.scalar_one_or_none():
            raise ValueError("Cannot create time entry on a day with vacation, sick day, or day off")

        # Check if date falls within a vacation range
        vacation_result = await self.db.execute(
            select(Vacation).where(and_(
                Vacation.user_id == user_id,
                Vacation.date_from <= entry_data.date,
                Vacation.date_to >= entry_data.date,
            ))
        )
        if vacation_result.scalar_one_or_none():
            raise ValueError("Cannot create time entry on a day with vacation, sick day, or day off")

        # Check for overlapping entries
        overlapping = await self._check_overlap(
            user_id,
            entry_data.date,
            entry_data.start_time,
            entry_data.end_time
        )
        if overlapping:
            raise ValueError("Time entry overlaps with existing entry")

        # Preserve user-provided break minutes, capped by the daily break limit.
        existing_entries = await self.get_user_entries_for_date(user_id, entry_data.date)
        break_minutes = entry_data.break_minutes
        existing_break = sum(e.break_minutes for e in existing_entries)
        if existing_break + break_minutes > 60:
            raise ValueError("Maximum total break time is 60 minutes per day")

        entry = TimeEntry(
            user_id=user_id,
            date=entry_data.date,
            start_time=entry_data.start_time,
            end_time=entry_data.end_time,
            break_minutes=break_minutes,
            workplace=entry_data.workplace,
            comment=entry_data.comment,
        )
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def update(self, entry_id: int, entry_data: Union[TimeEntryUpdate, TimeEntryUpdateAdmin]) -> Optional[TimeEntry]:
        """Update a time entry."""
        entry = await self.get_by_id(entry_id)
        if not entry:
            return None

        update_data = entry_data.model_dump(exclude_unset=True)

        # If date is changing, check for vacation/sick/dayoff status on new date
        if 'date' in update_data and update_data['date'] != entry.date:
            new_date = update_data['date']
            day_status_result = await self.db.execute(
                select(DayStatus).where(and_(
                    DayStatus.user_id == entry.user_id,
                    DayStatus.date == new_date,
                    DayStatus.status.in_([StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED, StatusType.DAYOFF])
                ))
            )
            if day_status_result.scalar_one_or_none():
                raise ValueError("Cannot move time entry to a day with vacation, sick day, or day off")

            vacation_result = await self.db.execute(
                select(Vacation).where(and_(
                    Vacation.user_id == entry.user_id,
                    Vacation.date_from <= new_date,
                    Vacation.date_to >= new_date,
                ))
            )
            if vacation_result.scalar_one_or_none():
                raise ValueError("Cannot move time entry to a day with vacation")

        # Check for overlapping if time is being changed
        if 'start_time' in update_data or 'end_time' in update_data:
            new_start = update_data.get('start_time', entry.start_time)
            new_end = update_data.get('end_time', entry.end_time)
            new_date = update_data.get('date', entry.date)

            overlapping = await self._check_overlap(
                entry.user_id,
                new_date,
                new_start,
                new_end,
                exclude_id=entry_id
            )
            if overlapping:
                raise ValueError("Time entry overlaps with existing entry")

        for field, value in update_data.items():
            setattr(entry, field, value)

        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def delete(self, entry_id: int) -> bool:
        """Delete a time entry."""
        entry = await self.get_by_id(entry_id)
        if not entry:
            return False
        await self.db.delete(entry)
        await self.db.flush()
        return True

    async def _check_overlap(
        self,
        user_id: int,
        target_date: date,
        start_time: time,
        end_time: time,
        exclude_id: Optional[int] = None
    ) -> bool:
        """Check if a time range overlaps with existing entries."""
        query = select(TimeEntry).where(and_(
            TimeEntry.user_id == user_id,
            TimeEntry.date == target_date,
            # Overlap check: new_start < existing_end AND new_end > existing_start
            TimeEntry.start_time < end_time,
            TimeEntry.end_time > start_time
        ))

        if exclude_id:
            query = query.where(TimeEntry.id != exclude_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None

    async def get_users_in_office(self, target_date: date) -> List[int]:
        """Get list of user IDs who are working in office on a given date."""
        result = await self.db.execute(
            select(TimeEntry.user_id)
            .where(and_(
                TimeEntry.date == target_date,
                TimeEntry.workplace == WorkplaceType.OFFICE
            ))
            .distinct()
        )
        return [row[0] for row in result.fetchall()]

    async def has_entries_for_date(self, user_id: int, target_date: date) -> bool:
        """Check if user has any time entries for a date."""
        result = await self.db.execute(
            select(func.count(TimeEntry.id))
            .where(and_(
                TimeEntry.user_id == user_id,
                TimeEntry.date == target_date
            ))
        )
        count = result.scalar()
        return count > 0

    async def get_dates_with_entries(
        self,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> List[date]:
        """Get list of dates that have time entries."""
        result = await self.db.execute(
            select(TimeEntry.date)
            .where(and_(
                TimeEntry.user_id == user_id,
                TimeEntry.date >= start_date,
                TimeEntry.date <= end_date
            ))
            .distinct()
        )
        return [row[0] for row in result.fetchall()]

    async def get_weekly_hours(self, user_id: int, target_date: date) -> float:
        """Get total work hours for the week containing the target date."""
        from datetime import timedelta
        # Get Monday of the week
        weekday = target_date.weekday()
        week_start = target_date - timedelta(days=weekday)
        week_end = week_start + timedelta(days=6)

        entries = await self.get_user_entries_for_range(user_id, week_start, week_end)
        total_minutes = sum(e.duration_minutes for e in entries)
        return total_minutes / 60

    async def get_monthly_hours(self, user_id: int, target_date: date) -> float:
        """Get total work hours for the month containing the target date."""
        import calendar
        # Get first and last day of the month
        month_start = date(target_date.year, target_date.month, 1)
        last_day = calendar.monthrange(target_date.year, target_date.month)[1]
        month_end = date(target_date.year, target_date.month, last_day)

        entries = await self.get_user_entries_for_range(user_id, month_start, month_end)
        total_minutes = sum(e.duration_minutes for e in entries)
        return total_minutes / 60

    @staticmethod
    def get_monthly_hours_limit(year: int, month: int) -> int:
        """Get the maximum work hours for a given month based on Mon-Fri count.

        Note: this synchronous variant does NOT subtract holidays. Prefer
        get_monthly_hours_limit_with_holidays(db, year, month) when accuracy is needed.
        """
        import calendar
        working_days = 0
        last_day = calendar.monthrange(year, month)[1]
        for day in range(1, last_day + 1):
            weekday = date(year, month, day).weekday()
            if weekday < 5:  # Monday = 0, Friday = 4
                working_days += 1
        return working_days * 8

    @staticmethod
    async def get_monthly_hours_limit_with_holidays(db: AsyncSession, year: int, month: int) -> int:
        """Get the maximum work hours for a given month, excluding weekends AND holidays."""
        import calendar as _calendar
        from app.models.calendar_day import CalendarDay, DayType
        from app.services.calendar_service import CalendarService

        last_day = _calendar.monthrange(year, month)[1]
        month_start = date(year, month, 1)
        month_end = date(year, month, last_day)

        calendar_service = CalendarService(db)
        await calendar_service.ensure_days_exist(month_start, month_end)

        # Count Mon-Fri days
        working_days = 0
        for day in range(1, last_day + 1):
            if date(year, month, day).weekday() < 5:
                working_days += 1

        # Subtract holidays that fall on Mon-Fri
        result = await db.execute(
            select(CalendarDay).where(
                CalendarDay.date >= month_start,
                CalendarDay.date <= month_end,
                CalendarDay.day_type == DayType.HOLIDAY,
            )
        )
        for cd in result.scalars().all():
            if cd.date.weekday() < 5:
                working_days -= 1

        if working_days < 0:
            working_days = 0
        return working_days * 8
