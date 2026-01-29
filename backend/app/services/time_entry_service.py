from datetime import date, time
from typing import List, Optional
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.time_entry import TimeEntry, WorkplaceType
from app.schemas.time_entry import TimeEntryCreate, TimeEntryUpdate, DaySummary, TimeEntryResponse


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

    async def create(self, user_id: int, entry_data: TimeEntryCreate) -> TimeEntry:
        """Create a new time entry."""
        # Allow entries for current week (up to end of week - Friday)
        today = date.today()
        # Calculate end of current week (Friday)
        days_until_friday = 4 - today.weekday()  # 4 = Friday
        if days_until_friday < 0:
            days_until_friday = 0  # If today is Saturday/Sunday, use today
        from datetime import timedelta
        week_end = today + timedelta(days=days_until_friday)

        if entry_data.date > week_end:
            raise ValueError("Cannot create time entries beyond current week")

        # Check for overlapping entries
        overlapping = await self._check_overlap(
            user_id,
            entry_data.date,
            entry_data.start_time,
            entry_data.end_time
        )
        if overlapping:
            raise ValueError("Time entry overlaps with existing entry")

        entry = TimeEntry(
            user_id=user_id,
            date=entry_data.date,
            start_time=entry_data.start_time,
            end_time=entry_data.end_time,
            break_minutes=entry_data.break_minutes,
            workplace=entry_data.workplace,
            comment=entry_data.comment,
        )
        self.db.add(entry)
        await self.db.flush()
        await self.db.refresh(entry)
        return entry

    async def update(self, entry_id: int, entry_data: TimeEntryUpdate) -> Optional[TimeEntry]:
        """Update a time entry."""
        entry = await self.get_by_id(entry_id)
        if not entry:
            return None

        update_data = entry_data.model_dump(exclude_unset=True)

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
