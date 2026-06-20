from datetime import date
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.day_status import DayStatus, StatusType
from app.models.time_entry import TimeEntry
from app.models.vacation import Vacation
from app.schemas.day_status import DayStatusCreate, DayStatusUpdate


class DayStatusService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, status_id: int) -> Optional[DayStatus]:
        """Get day status by ID."""
        result = await self.db.execute(
            select(DayStatus).where(DayStatus.id == status_id)
        )
        return result.scalar_one_or_none()

    async def get_user_status_for_date(self, user_id: int, target_date: date) -> Optional[DayStatus]:
        """Get day status for a user on a specific date."""
        result = await self.db.execute(
            select(DayStatus)
            .where(and_(
                DayStatus.user_id == user_id,
                DayStatus.date == target_date
            ))
        )
        return result.scalar_one_or_none()

    async def get_user_statuses_for_range(
        self,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> List[DayStatus]:
        """Get all day statuses for a user in a date range."""
        result = await self.db.execute(
            select(DayStatus)
            .where(and_(
                DayStatus.user_id == user_id,
                DayStatus.date >= start_date,
                DayStatus.date <= end_date
            ))
            .order_by(DayStatus.date)
        )
        return list(result.scalars().all())

    async def get_user_sick_days(self, user_id: int) -> List[DayStatus]:
        """Get all sick days for a user."""
        result = await self.db.execute(
            select(DayStatus)
            .where(and_(
                DayStatus.user_id == user_id,
                DayStatus.status == StatusType.SICK
            ))
            .order_by(DayStatus.date.desc())
        )
        return list(result.scalars().all())

    async def get_user_day_offs(self, user_id: int) -> List[DayStatus]:
        """Get all day offs for a user."""
        result = await self.db.execute(
            select(DayStatus)
            .where(and_(
                DayStatus.user_id == user_id,
                DayStatus.status == StatusType.DAYOFF
            ))
            .order_by(DayStatus.date.desc())
        )
        return list(result.scalars().all())

    async def create(self, user_id: int, status_data: DayStatusCreate, admin_bypass: bool = False) -> DayStatus:
        """Create or update a day status."""
        skip_statuses = [StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED, StatusType.DAYOFF]

        # Check if date has time entries - can't create status on a day with entries
        if not admin_bypass and status_data.status in skip_statuses:
            entry_result = await self.db.execute(
                select(TimeEntry).where(and_(
                    TimeEntry.user_id == user_id,
                    TimeEntry.date == status_data.date,
                ))
            )
            if entry_result.scalar_one_or_none():
                raise ValueError("Cannot set day status on a day with time entries")

        # Check if date falls within a vacation range
        if not admin_bypass and status_data.status in [StatusType.SICK, StatusType.DAYOFF, StatusType.EXCUSED]:
            vacation_result = await self.db.execute(
                select(Vacation).where(and_(
                    Vacation.user_id == user_id,
                    Vacation.date_from <= status_data.date,
                    Vacation.date_to >= status_data.date,
                ))
            )
            if vacation_result.scalar_one_or_none():
                raise ValueError("Cannot set day status on a day with vacation")

        # Check if status already exists
        existing = await self.get_user_status_for_date(user_id, status_data.date)
        if existing:
            # Update existing
            existing.status = status_data.status
            existing.note = status_data.note
            existing.auto_skip_day = status_data.status in skip_statuses
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        status = DayStatus(
            user_id=user_id,
            date=status_data.date,
            status=status_data.status,
            note=status_data.note,
            auto_skip_day=status_data.status in skip_statuses,
        )
        self.db.add(status)
        await self.db.flush()
        await self.db.refresh(status)
        return status

    async def update(self, status_id: int, status_data: DayStatusUpdate) -> Optional[DayStatus]:
        """Update a day status."""
        skip_statuses = [StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED, StatusType.DAYOFF]

        status = await self.get_by_id(status_id)
        if not status:
            return None

        update_data = status_data.model_dump(exclude_unset=True)

        # Check conflicts when changing to a skip status or changing date
        new_status_type = update_data.get('status', status.status)
        new_date = update_data.get('date', status.date)

        if new_status_type in skip_statuses:
            # Check if date has time entries
            entry_result = await self.db.execute(
                select(TimeEntry).where(and_(
                    TimeEntry.user_id == status.user_id,
                    TimeEntry.date == new_date,
                ))
            )
            if entry_result.scalar_one_or_none():
                raise ValueError("Cannot set day status on a day with time entries")

            # Check if date falls within a vacation range (unless setting vacation status)
            if new_status_type != StatusType.VACATION:
                vacation_result = await self.db.execute(
                    select(Vacation).where(and_(
                        Vacation.user_id == status.user_id,
                        Vacation.date_from <= new_date,
                        Vacation.date_to >= new_date,
                    ))
                )
                if vacation_result.scalar_one_or_none():
                    raise ValueError("Cannot set day status on a day with vacation")

        for field, value in update_data.items():
            setattr(status, field, value)

        # Update auto_skip_day based on status
        if 'status' in update_data:
            status.auto_skip_day = status.status in skip_statuses

        await self.db.flush()
        await self.db.refresh(status)
        return status

    async def delete(self, status_id: int) -> bool:
        """Delete a day status."""
        status = await self.get_by_id(status_id)
        if not status:
            return False
        await self.db.delete(status)
        await self.db.flush()
        return True

    async def is_skip_day(self, user_id: int, target_date: date) -> bool:
        """Check if a day should be skipped (sick, vacation, excused, or dayoff)."""
        status = await self.get_user_status_for_date(user_id, target_date)
        if not status:
            return False
        return status.status in [StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED, StatusType.DAYOFF]

    async def get_sick_vacation_dates(
        self,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> List[date]:
        """Get list of dates with sick, vacation, excused, or dayoff status."""
        result = await self.db.execute(
            select(DayStatus.date)
            .where(and_(
                DayStatus.user_id == user_id,
                DayStatus.date >= start_date,
                DayStatus.date <= end_date,
                DayStatus.status.in_([StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED, StatusType.DAYOFF])
            ))
        )
        return [row[0] for row in result.fetchall()]

    async def count_by_status(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        status: StatusType
    ) -> int:
        """Count days with a specific status in a range."""
        result = await self.db.execute(
            select(DayStatus)
            .where(and_(
                DayStatus.user_id == user_id,
                DayStatus.date >= start_date,
                DayStatus.date <= end_date,
                DayStatus.status == status
            ))
        )
        return len(list(result.scalars().all()))
