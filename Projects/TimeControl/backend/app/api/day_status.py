from datetime import date, timedelta
from typing import List
from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.schemas.day_status import DayStatusCreate, DayStatusUpdate, DayStatusResponse
from app.services.day_status_service import DayStatusService
from app.models.user import UserRole
from app.models.day_status import StatusType
from app.models.employee_profile import EmployeeProfile
from .deps import DbSession, CurrentUser

router = APIRouter()


class SickDayRangeCreate(BaseModel):
    start_date: date
    end_date: date
    note: str | None = None


@router.get("", response_model=List[DayStatusResponse])
async def get_day_statuses(
    date_from: date = Query(None),
    date_to: date = Query(None),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get day statuses for current user."""
    day_status_service = DayStatusService(db)

    if date_from and date_to:
        statuses = await day_status_service.get_user_statuses_for_range(
            current_user.id, date_from, date_to
        )
    else:
        # Default to current month
        today = date.today()
        start = date(today.year, today.month, 1)
        if today.month == 12:
            end = date(today.year + 1, 1, 1)
        else:
            end = date(today.year, today.month + 1, 1)
        statuses = await day_status_service.get_user_statuses_for_range(
            current_user.id, start, end
        )

    return [DayStatusResponse.model_validate(s) for s in statuses]


@router.get("/my-sick-days", response_model=List[DayStatusResponse])
async def get_my_sick_days(
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get all sick days for current user."""
    day_status_service = DayStatusService(db)
    statuses = await day_status_service.get_user_sick_days(current_user.id)
    return [DayStatusResponse.model_validate(s) for s in statuses]


@router.get("/my-day-offs", response_model=List[DayStatusResponse])
async def get_my_day_offs(
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get all day offs for current user."""
    day_status_service = DayStatusService(db)
    statuses = await day_status_service.get_user_day_offs(current_user.id)
    return [DayStatusResponse.model_validate(s) for s in statuses]


@router.get("/date", response_model=DayStatusResponse)
async def get_day_status_for_date(
    date_param: date = Query(..., alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get day status for a specific date."""
    day_status_service = DayStatusService(db)
    day_status = await day_status_service.get_user_status_for_date(
        current_user.id, date_param
    )

    if not day_status:
        raise HTTPException(
            status_code=404,
            detail="No status for this date"
        )

    return DayStatusResponse.model_validate(day_status)


@router.post("", response_model=DayStatusResponse, status_code=status.HTTP_201_CREATED)
async def create_day_status(
    status_data: DayStatusCreate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Create or update a day status (e.g., mark as sick).

    DAYOFF status can only be set by hourly employees or admins.
    """
    is_admin = current_user.role == UserRole.ADMIN

    # Get employee profile for validation
    profile_result = await db.execute(
        select(EmployeeProfile).where(EmployeeProfile.user_id == current_user.id)
    )
    profile = profile_result.scalar_one_or_none()

    # Check employment start date
    if profile and profile.employment_start_date and status_data.date < profile.employment_start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create entries before employment start date ({profile.employment_start_date})"
        )

    # Check DAYOFF restriction - only hourly employees or admins can use it
    if status_data.status == StatusType.DAYOFF and not is_admin:
        if not profile or profile.payment_type != 'hourly':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="DAYOFF status can only be set by hourly employees"
            )

    day_status_service = DayStatusService(db)
    try:
        day_status = await day_status_service.create(current_user.id, status_data)
        return DayStatusResponse.model_validate(day_status)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/sick-day", response_model=List[DayStatusResponse], status_code=status.HTTP_201_CREATED)
async def create_sick_day_range(
    data: SickDayRangeCreate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Create sick day for a date range."""
    day_status_service = DayStatusService(db)

    if data.start_date > data.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date must be before end date"
        )

    # Check employment start date
    profile_result = await db.execute(
        select(EmployeeProfile).where(EmployeeProfile.user_id == current_user.id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile and profile.employment_start_date and data.start_date < profile.employment_start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create entries before employment start date ({profile.employment_start_date})"
        )

    try:
        created_statuses = []
        current_date = data.start_date
        while current_date <= data.end_date:
            status_data = DayStatusCreate(
                date=current_date,
                status="sick",
                note=data.note
            )
            day_status = await day_status_service.create(current_user.id, status_data)
            created_statuses.append(DayStatusResponse.model_validate(day_status))
            current_date += timedelta(days=1)

        return created_statuses
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/{status_id}", response_model=DayStatusResponse)
async def update_day_status(
    status_id: int,
    status_data: DayStatusUpdate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Update a day status.

    Users cannot change dates that are in the past.
    Admins can update any day status.
    """
    day_status_service = DayStatusService(db)
    day_status = await day_status_service.get_by_id(status_id)

    if not day_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Day status not found"
        )

    # Allow admin to bypass restrictions
    is_admin = current_user.role == UserRole.ADMIN

    if day_status.user_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this status"
        )

    today = date.today()

    # Non-admin restrictions
    if not is_admin:
        # Cannot update day status for past dates
        if day_status.date < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify day status for a past date"
            )

        # If trying to change the date, new date must be >= today
        if status_data.date is not None and status_data.date < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New date cannot be in the past"
            )

    try:
        updated = await day_status_service.update(status_id, status_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    return DayStatusResponse.model_validate(updated)


@router.delete("/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_day_status(
    status_id: int,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Delete a day status.

    Users can only delete day statuses for future dates.
    Admins can delete any day status.
    """
    day_status_service = DayStatusService(db)
    day_status = await day_status_service.get_by_id(status_id)

    if not day_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Day status not found"
        )

    # Allow admin to bypass restrictions
    is_admin = current_user.role == UserRole.ADMIN

    if day_status.user_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this status"
        )

    today = date.today()

    # Non-admin: cannot delete past day statuses (can delete today and future)
    if not is_admin:
        if day_status.date < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete day status for past dates"
            )

    await day_status_service.delete(status_id)
