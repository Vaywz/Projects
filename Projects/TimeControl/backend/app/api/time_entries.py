from datetime import date
from typing import List
from fastapi import APIRouter, HTTPException, status, Query
from sqlalchemy import select

from app.schemas.time_entry import TimeEntryCreate, TimeEntryUpdate, TimeEntryResponse, DaySummary
from app.services.time_entry_service import TimeEntryService
from app.services.day_status_service import DayStatusService
from app.models.day_status import StatusType
from app.models.user import UserRole
from app.models.employee_profile import EmployeeProfile
from .deps import DbSession, CurrentUser

router = APIRouter()


@router.get("", response_model=List[TimeEntryResponse])
async def get_time_entries(
    date_param: date = Query(None, alias="date"),
    date_from: date = Query(None),
    date_to: date = Query(None),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get time entries for current user."""
    time_entry_service = TimeEntryService(db)

    if date_param:
        entries = await time_entry_service.get_user_entries_for_date(
            current_user.id, date_param
        )
    elif date_from and date_to:
        entries = await time_entry_service.get_user_entries_for_range(
            current_user.id, date_from, date_to
        )
    else:
        # Default to today
        entries = await time_entry_service.get_user_entries_for_date(
            current_user.id, date.today()
        )

    return [TimeEntryResponse.model_validate(e) for e in entries]


@router.get("/day-summary", response_model=DaySummary)
async def get_day_summary(
    date_param: date = Query(..., alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get summary of time entries for a specific day."""
    time_entry_service = TimeEntryService(db)
    return await time_entry_service.get_day_summary(current_user.id, date_param)


@router.get("/weekly-hours")
async def get_weekly_hours(
    date_param: date = Query(..., alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get total work hours for the week containing the specified date."""
    time_entry_service = TimeEntryService(db)
    hours = await time_entry_service.get_weekly_hours(current_user.id, date_param)
    return {"weekly_hours": hours}


@router.get("/monthly-hours")
async def get_monthly_hours(
    date_param: date = Query(..., alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get total work hours and limit for the month containing the specified date."""
    time_entry_service = TimeEntryService(db)
    hours = await time_entry_service.get_monthly_hours(current_user.id, date_param)
    limit = await TimeEntryService.get_monthly_hours_limit_with_holidays(db, date_param.year, date_param.month)
    return {
        "monthly_hours": hours,
        "monthly_limit": limit,
        "remaining_hours": max(0, limit - hours)
    }


@router.post("", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_time_entry(
    entry_data: TimeEntryCreate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Create a new time entry."""
    # Check if day has sick/vacation status
    day_status_service = DayStatusService(db)
    day_status = await day_status_service.get_user_status_for_date(
        current_user.id, entry_data.date
    )
    if day_status and day_status.status in [StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED, StatusType.DAYOFF]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create time entry for a day marked as {day_status.status.value}"
        )

    time_entry_service = TimeEntryService(db)

    # Get employee profile to check payment type and employment start date
    profile_result = await db.execute(
        select(EmployeeProfile).where(EmployeeProfile.user_id == current_user.id)
    )
    profile = profile_result.scalar_one_or_none()
    payment_type = profile.payment_type if profile else 'salary'

    # Check employment start date
    if profile and profile.employment_start_date and entry_data.date < profile.employment_start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create entries before employment start date ({profile.employment_start_date})"
        )

    # For non-admin users, enforce break time rules and daily limit
    if current_user.role != UserRole.ADMIN:
        existing_entries = await time_entry_service.get_user_entries_for_date(
            current_user.id, entry_data.date
        )

        existing_break = sum(e.break_minutes for e in existing_entries)
        if existing_break + entry_data.break_minutes > 60:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum total break time is 60 minutes per day"
            )

        # Calculate existing work hours for the day
        existing_work_minutes = sum(e.duration_minutes for e in existing_entries)

        # Calculate new entry work minutes
        start_minutes = entry_data.start_time.hour * 60 + entry_data.start_time.minute
        end_minutes = entry_data.end_time.hour * 60 + entry_data.end_time.minute
        new_work_minutes = (end_minutes - start_minutes) - entry_data.break_minutes

        # Check if total exceeds 8 hours (480 minutes)
        total_work_minutes = existing_work_minutes + new_work_minutes
        if total_work_minutes > 480:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum total work time per day is 8 hours"
            )

        # Check weekly hours limit (40 hours max)
        current_weekly_hours = await time_entry_service.get_weekly_hours(
            current_user.id, entry_data.date
        )
        new_entry_hours = new_work_minutes / 60
        if current_weekly_hours + new_entry_hours > 40:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum total work time per week is 40 hours"
            )

        # Check monthly hours limit
        current_monthly_hours = await time_entry_service.get_monthly_hours(
            current_user.id, entry_data.date
        )
        monthly_limit = await TimeEntryService.get_monthly_hours_limit_with_holidays(
            db, entry_data.date.year, entry_data.date.month
        )
        if current_monthly_hours + new_entry_hours > monthly_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum total work time per month is {monthly_limit} hours"
            )

    try:
        entry = await time_entry_service.create(current_user.id, entry_data, payment_type=payment_type)
        return TimeEntryResponse.model_validate(entry)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{entry_id}", response_model=TimeEntryResponse)
async def get_time_entry(
    entry_id: int,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get a specific time entry."""
    time_entry_service = TimeEntryService(db)
    entry = await time_entry_service.get_by_id(entry_id)

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Time entry not found"
        )

    # Allow admin to access any entry, regular users only their own
    if entry.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this entry"
        )

    return TimeEntryResponse.model_validate(entry)


@router.put("/{entry_id}", response_model=TimeEntryResponse)
async def update_time_entry(
    entry_id: int,
    entry_data: TimeEntryUpdate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Update a time entry."""
    time_entry_service = TimeEntryService(db)
    entry = await time_entry_service.get_by_id(entry_id)

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Time entry not found"
        )

    # Check ownership
    if entry.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this entry"
        )

    # For non-admin users, check if entry date is today or in the future
    if current_user.role != UserRole.ADMIN and entry.user_id == current_user.id:
        today = date.today()
        if entry.date < today:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="EDIT_TIME_EXPIRED"
            )

    try:
        updated = await time_entry_service.update(entry_id, entry_data)
        return TimeEntryResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_time_entry(
    entry_id: int,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Delete a time entry."""
    time_entry_service = TimeEntryService(db)
    entry = await time_entry_service.get_by_id(entry_id)

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Time entry not found"
        )

    # Check ownership
    if entry.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this entry"
        )

    # For non-admin users, check if entry date is today or in the future
    if current_user.role != UserRole.ADMIN and entry.user_id == current_user.id:
        today = date.today()
        if entry.date < today:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="EDIT_TIME_EXPIRED"
            )

    await time_entry_service.delete(entry_id)
