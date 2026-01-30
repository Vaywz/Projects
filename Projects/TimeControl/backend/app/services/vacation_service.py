from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.vacation import Vacation, VacationStatus
from app.models.day_status import DayStatus, StatusType
from app.schemas.vacation import VacationCreate, VacationUpdate


class VacationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, vacation_id: int) -> Optional[Vacation]:
        """Get vacation by ID."""
        result = await self.db.execute(
            select(Vacation).where(Vacation.id == vacation_id)
        )
        return result.scalar_one_or_none()

    async def get_user_vacations(self, user_id: int) -> List[Vacation]:
        """Get all vacations for a user."""
        result = await self.db.execute(
            select(Vacation)
            .where(Vacation.user_id == user_id)
            .order_by(Vacation.date_from.desc())
        )
        return list(result.scalars().all())

    async def get_user_vacations_for_year(self, user_id: int, year: int) -> List[Vacation]:
        """Get vacations for a user in a specific year."""
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)

        result = await self.db.execute(
            select(Vacation)
            .where(and_(
                Vacation.user_id == user_id,
                or_(
                    and_(Vacation.date_from >= start_date, Vacation.date_from <= end_date),
                    and_(Vacation.date_to >= start_date, Vacation.date_to <= end_date),
                    and_(Vacation.date_from <= start_date, Vacation.date_to >= end_date)
                )
            ))
            .order_by(Vacation.date_from)
        )
        return list(result.scalars().all())

    async def create(self, user_id: int, vacation_data: VacationCreate) -> Vacation:
        """Create a new vacation and set day statuses."""
        # Check for overlapping vacations
        overlapping = await self._check_overlap(
            user_id,
            vacation_data.date_from,
            vacation_data.date_to
        )
        if overlapping:
            raise ValueError("Vacation overlaps with existing vacation")

        vacation = Vacation(
            user_id=user_id,
            date_from=vacation_data.date_from,
            date_to=vacation_data.date_to,
            status=VacationStatus.APPROVED,
            note=vacation_data.note,
        )
        self.db.add(vacation)
        await self.db.flush()

        # Create day statuses for the vacation period
        await self._create_day_statuses(user_id, vacation_data.date_from, vacation_data.date_to)

        await self.db.refresh(vacation)
        return vacation

    async def update(self, vacation_id: int, vacation_data: VacationUpdate) -> Optional[Vacation]:
        """Update a vacation."""
        vacation = await self.get_by_id(vacation_id)
        if not vacation:
            return None

        update_data = vacation_data.model_dump(exclude_unset=True)

        # If dates are changing, check for overlap and update day statuses
        if 'date_from' in update_data or 'date_to' in update_data:
            new_from = update_data.get('date_from', vacation.date_from)
            new_to = update_data.get('date_to', vacation.date_to)

            overlapping = await self._check_overlap(
                vacation.user_id,
                new_from,
                new_to,
                exclude_id=vacation_id
            )
            if overlapping:
                raise ValueError("Vacation overlaps with existing vacation")

            # Remove old day statuses
            await self._remove_day_statuses(vacation.user_id, vacation.date_from, vacation.date_to)
            # Create new day statuses
            await self._create_day_statuses(vacation.user_id, new_from, new_to)

        for field, value in update_data.items():
            setattr(vacation, field, value)

        await self.db.flush()
        await self.db.refresh(vacation)
        return vacation

    async def delete(self, vacation_id: int) -> bool:
        """Delete a vacation and remove associated day statuses."""
        vacation = await self.get_by_id(vacation_id)
        if not vacation:
            return False

        # Remove day statuses
        await self._remove_day_statuses(vacation.user_id, vacation.date_from, vacation.date_to)

        await self.db.delete(vacation)
        await self.db.flush()
        return True

    async def _check_overlap(
        self,
        user_id: int,
        date_from: date,
        date_to: date,
        exclude_id: Optional[int] = None
    ) -> bool:
        """Check if vacation dates overlap with existing vacations."""
        query = select(Vacation).where(and_(
            Vacation.user_id == user_id,
            Vacation.date_from <= date_to,
            Vacation.date_to >= date_from
        ))

        if exclude_id:
            query = query.where(Vacation.id != exclude_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None

    async def _create_day_statuses(
        self,
        user_id: int,
        date_from: date,
        date_to: date
    ) -> None:
        """Create day statuses for vacation days."""
        current_date = date_from
        while current_date <= date_to:
            # Check if status already exists
            result = await self.db.execute(
                select(DayStatus)
                .where(and_(
                    DayStatus.user_id == user_id,
                    DayStatus.date == current_date
                ))
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.status = StatusType.VACATION
                existing.auto_skip_day = True
            else:
                day_status = DayStatus(
                    user_id=user_id,
                    date=current_date,
                    status=StatusType.VACATION,
                    auto_skip_day=True,
                )
                self.db.add(day_status)

            current_date += timedelta(days=1)

        await self.db.flush()

    async def _remove_day_statuses(
        self,
        user_id: int,
        date_from: date,
        date_to: date
    ) -> None:
        """Remove day statuses for vacation days."""
        result = await self.db.execute(
            select(DayStatus)
            .where(and_(
                DayStatus.user_id == user_id,
                DayStatus.date >= date_from,
                DayStatus.date <= date_to,
                DayStatus.status == StatusType.VACATION
            ))
        )
        statuses = result.scalars().all()
        for status in statuses:
            await self.db.delete(status)
        await self.db.flush()

    async def is_user_on_vacation(self, user_id: int, target_date: date) -> bool:
        """Check if user is on vacation on a specific date."""
        result = await self.db.execute(
            select(Vacation)
            .where(and_(
                Vacation.user_id == user_id,
                Vacation.date_from <= target_date,
                Vacation.date_to >= target_date,
                Vacation.status == VacationStatus.APPROVED
            ))
        )
        return result.scalar_one_or_none() is not None

    async def get_current_vacation(self, user_id: int) -> Optional[Vacation]:
        """Get current active vacation for user."""
        today = date.today()
        result = await self.db.execute(
            select(Vacation)
            .where(and_(
                Vacation.user_id == user_id,
                Vacation.date_from <= today,
                Vacation.date_to >= today,
                Vacation.status == VacationStatus.APPROVED
            ))
        )
        return result.scalar_one_or_none()
