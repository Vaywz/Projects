from datetime import date
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query, UploadFile, File
import os
import uuid

from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas.employee_profile import EmployeeProfileUpdate, EmployeeFullResponse
from app.schemas.stats import PeriodType, StatsResponse
from app.schemas.day_status import DayStatusCreate, DayStatusResponse
from app.schemas.time_entry import TimeEntryCreate, TimeEntryResponse
from app.schemas.company_setting import (
    CompanySettingsResponse,
    IconSettingsUpdate,
    AllowedIconsResponse,
    ALLOWED_ICONS,
)
from app.services.user_service import UserService
from app.services.stats_service import StatsService
from app.services.time_entry_service import TimeEntryService
from app.services.day_status_service import DayStatusService
from app.services.company_settings_service import CompanySettingsService
from app.core.config import settings
from .deps import DbSession, CurrentAdmin

router = APIRouter()


# Employee management
@router.get("/employees", response_model=List[EmployeeFullResponse])
async def get_all_employees(
    active_only: bool = Query(True),
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Get all employees."""
    user_service = UserService(db)
    employees = await user_service.get_all_employees(active_only=active_only)
    return [EmployeeFullResponse.model_validate(e) for e in employees]


@router.post("/employees", response_model=EmployeeFullResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    user_data: UserCreate,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Create a new employee."""
    user_service = UserService(db)

    # Check if email already exists
    existing = await user_service.get_by_email(user_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user = await user_service.create(user_data)
    return EmployeeFullResponse.model_validate(user)


@router.get("/employees/{user_id}", response_model=EmployeeFullResponse)
async def get_employee(
    user_id: int,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Get a specific employee."""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    return EmployeeFullResponse.model_validate(user)


@router.put("/employees/{user_id}", response_model=EmployeeFullResponse)
async def update_employee(
    user_id: int,
    user_data: UserUpdate,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Update an employee."""
    user_service = UserService(db)
    try:
        user = await user_service.update(user_id, user_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    return EmployeeFullResponse.model_validate(user)


@router.put("/employees/{user_id}/profile", response_model=EmployeeFullResponse)
async def update_employee_profile(
    user_id: int,
    profile_data: EmployeeProfileUpdate,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Update an employee's profile."""
    user_service = UserService(db)
    profile = await user_service.update_profile(user_id, profile_data)

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    user = await user_service.get_by_id(user_id)
    return EmployeeFullResponse.model_validate(user)


@router.patch("/employees/{user_id}/activate")
async def activate_employee(
    user_id: int,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Activate an employee."""
    user_service = UserService(db)
    user = await user_service.activate(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    return {"message": "Employee activated", "user_id": user_id}


@router.patch("/employees/{user_id}/deactivate")
async def deactivate_employee(
    user_id: int,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Deactivate an employee."""
    user_service = UserService(db)
    user = await user_service.deactivate(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    return {"message": "Employee deactivated", "user_id": user_id}


@router.delete("/employees/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    user_id: int,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Delete an employee."""
    user_service = UserService(db)
    deleted = await user_service.delete(user_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )


# Avatar upload
@router.post("/employees/{user_id}/avatar")
async def upload_avatar(
    user_id: int,
    file: UploadFile = File(...),
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Upload employee avatar."""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP"
        )

    # Validate file size
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE // 1024 // 1024}MB"
        )

    # Create upload directory if not exists
    upload_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(upload_dir, exist_ok=True)

    # Generate unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(upload_dir, filename)

    # Save file
    with open(filepath, "wb") as f:
        f.write(content)

    # Update profile
    avatar_url = f"/uploads/avatars/{filename}"
    await user_service.update_profile(user_id, EmployeeProfileUpdate(avatar_url=avatar_url))

    return {"avatar_url": avatar_url}


# Statistics
@router.get("/stats", response_model=StatsResponse)
async def get_employee_stats(
    user_id: int = Query(...),
    period: PeriodType = Query(PeriodType.MONTH),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Get statistics for a specific employee."""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    stats_service = StatsService(db)
    return await stats_service.get_stats(
        user_id=user_id,
        period=period,
        date_from=date_from,
        date_to=date_to
    )


@router.get("/stats/summary")
async def get_all_employees_summary(
    period: PeriodType = Query(PeriodType.MONTH),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Get summary statistics for all employees."""
    user_service = UserService(db)
    stats_service = StatsService(db)

    employees = await user_service.get_all_employees(active_only=True)
    summaries = []

    for employee in employees:
        stats = await stats_service.get_stats(
            user_id=employee.id,
            period=period,
            date_from=date_from,
            date_to=date_to
        )

        summaries.append({
            "user_id": employee.id,
            "email": employee.email,
            "first_name": employee.profile.first_name if employee.profile else None,
            "last_name": employee.profile.last_name if employee.profile else None,
            "total_hours": stats.total_hours,
            "working_days": stats.working_days,
            "days_with_entries": stats.days_with_entries,
            "sick_days": stats.sick_days,
            "vacation_days": stats.vacation_days,
            "office_days": stats.office_days,
            "remote_days": stats.remote_days,
        })

    return {
        "period": period,
        "date_from": date_from,
        "date_to": date_to,
        "employees": summaries
    }


# Employee time entries view
@router.get("/employees/{user_id}/time-entries")
async def get_employee_time_entries(
    user_id: int,
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Get time entries for a specific employee."""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    time_entry_service = TimeEntryService(db)
    entries = await time_entry_service.get_user_entries_for_range(
        user_id, date_from, date_to
    )

    return [
        {
            "id": e.id,
            "date": e.date,
            "start_time": e.start_time.isoformat(),
            "end_time": e.end_time.isoformat(),
            "break_minutes": e.break_minutes,
            "workplace": e.workplace.value,
            "duration_minutes": e.duration_minutes,
            "duration_hours": e.duration_hours,
            "comment": e.comment,
        }
        for e in entries
    ]


# Create time entry for employee
@router.post("/employees/{user_id}/time-entries", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_employee_time_entry(
    user_id: int,
    entry_data: TimeEntryCreate,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Create a time entry for a specific employee."""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    time_entry_service = TimeEntryService(db)
    try:
        entry = await time_entry_service.create(user_id, entry_data)
        await db.commit()
        return TimeEntryResponse(
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
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# Day status management for employees (excused absence)
@router.post("/employees/{user_id}/day-status", response_model=DayStatusResponse, status_code=status.HTTP_201_CREATED)
async def create_employee_day_status(
    user_id: int,
    status_data: DayStatusCreate,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Create or update a day status for an employee (e.g., excused absence)."""
    user_service = UserService(db)
    user = await user_service.get_by_id(user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    day_status_service = DayStatusService(db)
    day_status = await day_status_service.create(user_id, status_data)
    return DayStatusResponse.model_validate(day_status)


@router.delete("/employees/{user_id}/day-status/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee_day_status(
    user_id: int,
    status_id: int,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Delete a day status for an employee."""
    day_status_service = DayStatusService(db)
    day_status = await day_status_service.get_by_id(status_id)

    if not day_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Day status not found"
        )

    if day_status.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Day status does not belong to this employee"
        )

    await day_status_service.delete(status_id)


# Company Settings
@router.get("/settings", response_model=CompanySettingsResponse)
async def get_company_settings(
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Get all company settings."""
    service = CompanySettingsService(db)
    return await service.get_all_settings()


@router.get("/settings/icons/allowed", response_model=AllowedIconsResponse)
async def get_allowed_icons(
    current_admin: CurrentAdmin = None,
):
    """Get list of allowed icon names."""
    return AllowedIconsResponse(icons=ALLOWED_ICONS)


@router.put("/settings/icons", response_model=CompanySettingsResponse)
async def update_icon_settings(
    icon_settings: IconSettingsUpdate,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Update icon settings."""
    service = CompanySettingsService(db)

    update_data = icon_settings.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value:
            try:
                await service.update_icon(key, value)
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(e)
                )

    await db.commit()
    return await service.get_all_settings()


@router.post("/settings/logo")
async def upload_company_logo(
    file: UploadFile = File(...),
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Upload company logo."""
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG"
        )

    # Validate file size
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE // 1024 // 1024}MB"
        )

    # Create upload directory if not exists
    upload_dir = os.path.join(settings.UPLOAD_DIR, "logo")
    os.makedirs(upload_dir, exist_ok=True)

    # Generate unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    filename = f"company_logo_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(upload_dir, filename)

    # Save file
    with open(filepath, "wb") as f:
        f.write(content)

    # Update setting
    logo_url = f"/uploads/logo/{filename}"
    service = CompanySettingsService(db)
    await service.update_logo(logo_url)
    await db.commit()

    return {"logo_url": logo_url}


@router.delete("/settings/logo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_logo(
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Delete company logo."""
    service = CompanySettingsService(db)
    await service.delete_logo()
    await db.commit()


@router.post("/settings/icons/upload")
async def upload_custom_icon(
    icon_type: str = Query(..., description="Icon type: icon_vacation, icon_sick, icon_office, icon_remote, icon_holiday, icon_excused"),
    file: UploadFile = File(...),
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Upload a custom SVG icon for a specific icon type."""
    # Validate icon type
    valid_types = ['icon_vacation', 'icon_sick', 'icon_office', 'icon_remote', 'icon_holiday', 'icon_excused']
    if icon_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid icon type. Must be one of: {', '.join(valid_types)}"
        )

    # Validate file type - only SVG allowed
    if file.content_type != "image/svg+xml":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only SVG files are allowed for custom icons"
        )

    # Validate file size (max 100KB for icons)
    content = await file.read()
    if len(content) > 100 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Max size for icons: 100KB"
        )

    # Create upload directory if not exists
    upload_dir = os.path.join(settings.UPLOAD_DIR, "icons")
    os.makedirs(upload_dir, exist_ok=True)

    # Generate unique filename
    filename = f"{icon_type}_{uuid.uuid4().hex[:8]}.svg"
    filepath = os.path.join(upload_dir, filename)

    # Save file
    with open(filepath, "wb") as f:
        f.write(content)

    # Update setting with the custom icon path
    icon_url = f"/uploads/icons/{filename}"
    service = CompanySettingsService(db)
    await service.update_icon(icon_type, icon_url)
    await db.commit()

    return {"icon_url": icon_url, "icon_type": icon_type}
