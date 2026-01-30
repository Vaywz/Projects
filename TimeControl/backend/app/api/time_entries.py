from datetime import date, datetime, timedelta
from typing import List
from fastapi import APIRouter, HTTPException, status, Query

from app.schemas.time_entry import TimeEntryCreate, TimeEntryUpdate, TimeEntryResponse, DaySummary
from app.services.time_entry_service import TimeEntryService
from app.services.day_status_service import DayStatusService
from app.models.day_status import StatusType
from app.models.user import UserRole
from .deps import DbSession, CurrentUser

# Time window for editing time entries (in minutes)
EDIT_TIME_WINDOW_MINUTES = 30

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
    if day_status and day_status.status in [StatusType.SICK, StatusType.VACATION]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create time entry for a day marked as {day_status.status.value}"
        )

    time_entry_service = TimeEntryService(db)

    # For non-admin users, enforce break time rules and daily limit
    if current_user.role != UserRole.ADMIN:
        existing_entries = await time_entry_service.get_user_entries_for_date(
            current_user.id, entry_data.date
        )

        # Calculate existing work hours for the day
        existing_work_minutes = sum(e.duration_minutes for e in existing_entries)

        if existing_entries:
            # Second or subsequent entry: break must be 0
            if entry_data.break_minutes != 0:
                entry_data.break_minutes = 0
        else:
            # First entry: break must be 60 minutes
            if entry_data.break_minutes != 60:
                entry_data.break_minutes = 60

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

    try:
        entry = await time_entry_service.create(current_user.id, entry_data)
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

    # For non-admin users, check if entry is within edit time window
    if current_user.role != UserRole.ADMIN and entry.user_id == current_user.id:
        time_since_creation = datetime.utcnow() - entry.created_at
        if time_since_creation > timedelta(minutes=EDIT_TIME_WINDOW_MINUTES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="EDIT_TIME_EXPIRED"
            )
        # Non-admin users cannot change break_minutes - keep original value
        if entry_data.break_minutes is not None:
            entry_data.break_minutes = entry.break_minutes

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

    # For non-admin users, check if entry is within edit time window
    if current_user.role != UserRole.ADMIN and entry.user_id == current_user.id:
        time_since_creation = datetime.utcnow() - entry.created_at
        if time_since_creation > timedelta(minutes=EDIT_TIME_WINDOW_MINUTES):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="EDIT_TIME_EXPIRED"
            )

    await time_entry_service.delete(entry_id)
