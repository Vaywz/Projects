from datetime import date
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workplace_plan import WorkplacePlan
from app.models.time_entry import WorkplaceType
from app.schemas.workplace_plan import WorkplacePlanCreate, WorkplacePlanUpdate


class WorkplacePlanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, plan_id: int) -> Optional[WorkplacePlan]:
        """Get workplace plan by ID."""
        result = await self.db.execute(
            select(WorkplacePlan).where(WorkplacePlan.id == plan_id)
        )
        return result.scalar_one_or_none()

    async def get_user_plan_for_date(self, user_id: int, target_date: date) -> Optional[WorkplacePlan]:
        """Get workplace plan for a user on a specific date."""
        result = await self.db.execute(
            select(WorkplacePlan)
            .where(and_(
                WorkplacePlan.user_id == user_id,
                WorkplacePlan.date == target_date
            ))
        )
        return result.scalar_one_or_none()

    async def get_user_plans_for_range(
        self,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> List[WorkplacePlan]:
        """Get all workplace plans for a user in a date range."""
        result = await self.db.execute(
            select(WorkplacePlan)
            .where(and_(
                WorkplacePlan.user_id == user_id,
                WorkplacePlan.date >= start_date,
                WorkplacePlan.date <= end_date
            ))
            .order_by(WorkplacePlan.date)
        )
        return list(result.scalars().all())

    async def get_office_plans_for_date(self, target_date: date) -> List[WorkplacePlan]:
        """Get all office plans for a specific date."""
        result = await self.db.execute(
            select(WorkplacePlan)
            .where(and_(
                WorkplacePlan.date == target_date,
                WorkplacePlan.workplace == WorkplaceType.OFFICE
            ))
        )
        return list(result.scalars().all())

    async def get_office_user_ids_for_date(self, target_date: date) -> List[int]:
        """Get list of user IDs who plan to be in office on a specific date."""
        result = await self.db.execute(
            select(WorkplacePlan.user_id)
            .where(and_(
                WorkplacePlan.date == target_date,
                WorkplacePlan.workplace == WorkplaceType.OFFICE
            ))
        )
        return [row[0] for row in result.fetchall()]

    async def get_remote_user_ids_for_date(self, target_date: date) -> List[int]:
        """Get list of user IDs who plan to work remote on a specific date."""
        result = await self.db.execute(
            select(WorkplacePlan.user_id)
            .where(and_(
                WorkplacePlan.date == target_date,
                WorkplacePlan.workplace == WorkplaceType.REMOTE
            ))
        )
        return [row[0] for row in result.fetchall()]

    async def create(self, user_id: int, plan_data: WorkplacePlanCreate) -> WorkplacePlan:
        """Create or update a workplace plan."""
        # Check if plan already exists
        existing = await self.get_user_plan_for_date(user_id, plan_data.date)
        if existing:
            # Update existing
            existing.workplace = plan_data.workplace
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        plan = WorkplacePlan(
            user_id=user_id,
            date=plan_data.date,
            workplace=plan_data.workplace,
        )
        self.db.add(plan)
        await self.db.flush()
        await self.db.refresh(plan)
        return plan

    async def update(self, plan_id: int, plan_data: WorkplacePlanUpdate) -> Optional[WorkplacePlan]:
        """Update a workplace plan."""
        plan = await self.get_by_id(plan_id)
        if not plan:
            return None

        plan.workplace = plan_data.workplace
        await self.db.flush()
        await self.db.refresh(plan)
        return plan

    async def delete(self, plan_id: int) -> bool:
        """Delete a workplace plan."""
        plan = await self.get_by_id(plan_id)
        if not plan:
            return False
        await self.db.delete(plan)
        await self.db.flush()
        return True

    async def delete_by_user_and_date(self, user_id: int, target_date: date) -> bool:
        """Delete a workplace plan by user and date."""
        plan = await self.get_user_plan_for_date(user_id, target_date)
        if not plan:
            return False
        await self.db.delete(plan)
        await self.db.flush()
        return True