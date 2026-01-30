from datetime import datetime
from typing import List, Optional
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.change_request import ChangeRequest, ChangeRequestStatus, ChangeRequestType
from app.models.time_entry import TimeEntry, WorkplaceType
from app.models.vacation import Vacation, VacationStatus
from app.models.day_status import DayStatus, StatusType
from app.models.user import User
from app.schemas.change_request import ChangeRequestCreate, ChangeRequestResolve


class ChangeRequestService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, request_id: int) -> Optional[ChangeRequest]:
        """Get change request by ID."""
        result = await self.db.execute(
            select(ChangeRequest)
            .options(
                joinedload(ChangeRequest.user).joinedload(User.profile),
                joinedload(ChangeRequest.time_entry)
            )
            .where(ChangeRequest.id == request_id)
        )
        return result.scalar_one_or_none()

    async def get_user_requests(
        self,
        user_id: int,
        status: Optional[ChangeRequestStatus] = None
    ) -> List[ChangeRequest]:
        """Get all change requests for a user."""
        query = select(ChangeRequest).where(ChangeRequest.user_id == user_id)
        if status:
            query = query.where(ChangeRequest.status == status)
        query = query.order_by(ChangeRequest.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_all_requests(
        self,
        status: Optional[ChangeRequestStatus] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[ChangeRequest]:
        """Get all change requests (for admin)."""
        query = select(ChangeRequest).options(
            joinedload(ChangeRequest.user).joinedload(User.profile)
        )
        if status:
            query = query.where(ChangeRequest.status == status)
        query = query.order_by(ChangeRequest.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.unique().scalars().all())

    async def get_pending_count(self) -> int:
        """Get count of pending requests."""
        result = await self.db.execute(
            select(func.count(ChangeRequest.id))
            .where(ChangeRequest.status == ChangeRequestStatus.PENDING)
        )
        return result.scalar() or 0

    async def get_total_count(self, status: Optional[ChangeRequestStatus] = None) -> int:
        """Get total count of requests."""
        query = select(func.count(ChangeRequest.id))
        if status:
            query = query.where(ChangeRequest.status == status)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def create(self, user_id: int, data: ChangeRequestCreate) -> ChangeRequest:
        """Create a new change request."""
        request = ChangeRequest(
            user_id=user_id,
            request_type=data.request_type,
            time_entry_id=data.time_entry_id,
            vacation_id=data.vacation_id,
            day_status_id=data.day_status_id,
            date=data.date,
            date_to=data.date_to,
            start_time=data.start_time,
            end_time=data.end_time,
            break_minutes=data.break_minutes,
            workplace=data.workplace,
            comment=data.comment,
            reason=data.reason,
            status=ChangeRequestStatus.PENDING,
        )
        self.db.add(request)
        await self.db.flush()
        await self.db.refresh(request)
        return request

    async def resolve(
        self,
        request_id: int,
        admin_id: int,
        data: ChangeRequestResolve
    ) -> Optional[ChangeRequest]:
        """Resolve (approve/reject) a change request."""
        # First, get a simple request without relationships for modification
        result = await self.db.execute(
            select(ChangeRequest).where(ChangeRequest.id == request_id)
        )
        request = result.scalar_one_or_none()
        if not request:
            return None

        if request.status != ChangeRequestStatus.PENDING:
            return None  # Already resolved

        request.status = data.status
        request.admin_id = admin_id
        request.admin_comment = data.admin_comment
        request.resolved_at = datetime.utcnow()

        # If approved, apply the change
        if data.status == ChangeRequestStatus.APPROVED:
            await self._apply_change(request)

        await self.db.flush()

        # Reload the request with all necessary relationships for response
        return await self.get_by_id(request_id)

    async def _apply_change(self, request: ChangeRequest):
        """Apply the approved change to time entries, vacations, or sick days."""
        # Time entry requests
        if request.request_type == ChangeRequestType.ADD:
            entry = TimeEntry(
                user_id=request.user_id,
                date=request.date,
                start_time=request.start_time,
                end_time=request.end_time,
                break_minutes=request.break_minutes or 0,
                workplace=WorkplaceType(request.workplace) if request.workplace else WorkplaceType.OFFICE,
                comment=request.comment,
            )
            self.db.add(entry)

        elif request.request_type == ChangeRequestType.EDIT:
            if request.time_entry_id:
                result = await self.db.execute(
                    select(TimeEntry).where(TimeEntry.id == request.time_entry_id)
                )
                entry = result.scalar_one_or_none()
                if entry:
                    if request.start_time:
                        entry.start_time = request.start_time
                    if request.end_time:
                        entry.end_time = request.end_time
                    if request.break_minutes is not None:
                        entry.break_minutes = request.break_minutes
                    if request.workplace:
                        entry.workplace = WorkplaceType(request.workplace)
                    if request.comment is not None:
                        entry.comment = request.comment

        elif request.request_type == ChangeRequestType.DELETE:
            if request.time_entry_id:
                result = await self.db.execute(
                    select(TimeEntry).where(TimeEntry.id == request.time_entry_id)
                )
                entry = result.scalar_one_or_none()
                if entry:
                    await self.db.delete(entry)

        # Vacation requests
        elif request.request_type == ChangeRequestType.ADD_VACATION:
            vacation = Vacation(
                user_id=request.user_id,
                date_from=request.date,
                date_to=request.date_to or request.date,
                status=VacationStatus.APPROVED,
                note=request.comment,
            )
            self.db.add(vacation)

        elif request.request_type == ChangeRequestType.EDIT_VACATION:
            if request.vacation_id:
                result = await self.db.execute(
                    select(Vacation).where(Vacation.id == request.vacation_id)
                )
                vacation = result.scalar_one_or_none()
                if vacation:
                    if request.date:
                        vacation.date_from = request.date
                    if request.date_to:
                        vacation.date_to = request.date_to
                    if request.comment is not None:
                        vacation.note = request.comment

        elif request.request_type == ChangeRequestType.DELETE_VACATION:
            if request.vacation_id:
                result = await self.db.execute(
                    select(Vacation).where(Vacation.id == request.vacation_id)
                )
                vacation = result.scalar_one_or_none()
                if vacation:
                    await self.db.delete(vacation)

        # Sick day requests
        elif request.request_type == ChangeRequestType.ADD_SICK_DAY:
            # Create sick day entries for each day in range
            from datetime import timedelta
            date_from = request.date
            date_to = request.date_to or request.date
            current_date = date_from
            while current_date <= date_to:
                day_status = DayStatus(
                    user_id=request.user_id,
                    date=current_date,
                    status=StatusType.SICK,
                    note=request.comment,
                )
                self.db.add(day_status)
                current_date += timedelta(days=1)

        elif request.request_type == ChangeRequestType.EDIT_SICK_DAY:
            if request.day_status_id:
                result = await self.db.execute(
                    select(DayStatus).where(DayStatus.id == request.day_status_id)
                )
                day_status = result.scalar_one_or_none()
                if day_status:
                    if request.date:
                        day_status.date = request.date
                    if request.comment is not None:
                        day_status.note = request.comment

        elif request.request_type == ChangeRequestType.DELETE_SICK_DAY:
            if request.day_status_id:
                result = await self.db.execute(
                    select(DayStatus).where(DayStatus.id == request.day_status_id)
                )
                day_status = result.scalar_one_or_none()
                if day_status:
                    await self.db.delete(day_status)

    async def delete(self, request_id: int, user_id: int) -> bool:
        """Delete a change request (only pending ones by owner)."""
        request = await self.get_by_id(request_id)
        if not request:
            return False
        if request.user_id != user_id:
            return False
        if request.status != ChangeRequestStatus.PENDING:
            return False
        await self.db.delete(request)
        await self.db.flush()
        return True