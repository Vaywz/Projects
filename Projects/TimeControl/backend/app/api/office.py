from datetime import date, timedelta
from typing import List
from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.schemas.employee_profile import EmployeeProfileResponse
from app.services.time_entry_service import TimeEntryService
from app.services.day_status_service import DayStatusService
from app.services.user_service import UserService
from app.services.workplace_plan_service import WorkplacePlanService
from app.models.day_status import StatusType
from .deps import DbSession, CurrentUser

router = APIRouter()


class OfficePresence(BaseModel):
    user_id: int
    first_name: str
    last_name: str
    avatar_url: str | None
    position: str | None


class EmployeeWithStatus(BaseModel):
    user_id: int
    first_name: str
    last_name: str
    avatar_url: str | None
    position: str | None
    status: str | None  # 'office', 'remote', 'sick', 'vacation', 'excused', 'no_plan', or 'office/remote'
    status_emoji: str | None  # emoji for the status
    statuses: List[str] | None = None  # list of statuses if multiple (e.g., ['office', 'remote'])


class AllEmployeesStatusResponse(BaseModel):
    date: date
    employees: List[EmployeeWithStatus]


class OfficePresenceResponse(BaseModel):
    date: date
    employees: List[OfficePresence]
    count: int


class WeeklyOfficePresenceResponse(BaseModel):
    week_start: date
    week_end: date
    days: List[OfficePresenceResponse]


@router.get("", response_model=OfficePresenceResponse)
async def get_office_presence(
    date_param: date = Query(None, alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get employees who are/will be in office on a specific date (based on workplace plans)."""
    target_date = date_param or date.today()

    workplace_plan_service = WorkplacePlanService(db)
    day_status_service = DayStatusService(db)
    user_service = UserService(db)

    # Get user IDs with office plans
    office_user_ids = await workplace_plan_service.get_office_user_ids_for_date(target_date)

    # Get all active employees
    all_employees = await user_service.get_active_employees()
    employees_map = {e.id: e for e in all_employees}

    # Filter out users on sick leave, vacation, or excused
    office_employees = []
    for user_id in office_user_ids:
        if user_id not in employees_map:
            continue

        user = employees_map[user_id]
        status = await day_status_service.get_user_status_for_date(user_id, target_date)

        if status and status.status in [StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED]:
            continue

        if user.profile:
            office_employees.append(OfficePresence(
                user_id=user_id,
                first_name=user.profile.first_name,
                last_name=user.profile.last_name,
                avatar_url=user.profile.avatar_url,
                position=user.profile.position,
            ))

    return OfficePresenceResponse(
        date=target_date,
        employees=office_employees,
        count=len(office_employees)
    )


@router.get("/week", response_model=WeeklyOfficePresenceResponse)
async def get_weekly_office_presence(
    date_param: date = Query(None, alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get office presence for a week (based on workplace plans)."""
    target_date = date_param or date.today()

    # Get week start (Monday)
    week_start = target_date - timedelta(days=target_date.weekday())
    week_end = week_start + timedelta(days=6)

    workplace_plan_service = WorkplacePlanService(db)
    day_status_service = DayStatusService(db)
    user_service = UserService(db)

    # Get all active employees
    all_employees = await user_service.get_active_employees()
    employees_map = {e.id: e for e in all_employees}

    days = []
    current = week_start
    while current <= week_end:
        # Get users with office plans for this day
        office_user_ids = await workplace_plan_service.get_office_user_ids_for_date(current)

        office_employees = []
        for user_id in office_user_ids:
            if user_id not in employees_map:
                continue

            user = employees_map[user_id]
            status = await day_status_service.get_user_status_for_date(user_id, current)

            if status and status.status in [StatusType.SICK, StatusType.VACATION, StatusType.EXCUSED]:
                continue

            if user.profile:
                office_employees.append(OfficePresence(
                    user_id=user_id,
                    first_name=user.profile.first_name,
                    last_name=user.profile.last_name,
                    avatar_url=user.profile.avatar_url,
                    position=user.profile.position,
                ))

        days.append(OfficePresenceResponse(
            date=current,
            employees=office_employees,
            count=len(office_employees)
        ))

        current += timedelta(days=1)

    return WeeklyOfficePresenceResponse(
        week_start=week_start,
        week_end=week_end,
        days=days
    )


@router.get("/all-employees", response_model=AllEmployeesStatusResponse)
async def get_all_employees_status(
    date_param: date = Query(None, alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get all employees with their status for a specific date."""
    target_date = date_param or date.today()

    workplace_plan_service = WorkplacePlanService(db)
    day_status_service = DayStatusService(db)
    user_service = UserService(db)
    time_entry_service = TimeEntryService(db)

    # Get all active employees
    all_employees = await user_service.get_active_employees()

    # Get workplace plans for this date
    office_user_ids = await workplace_plan_service.get_office_user_ids_for_date(target_date)
    remote_user_ids = await workplace_plan_service.get_remote_user_ids_for_date(target_date)

    employees_with_status = []

    for user in all_employees:
        if not user.profile:
            continue

        # Get day status (sick, vacation, excused)
        day_status = await day_status_service.get_user_status_for_date(user.id, target_date)

        # Get time entries for this date to determine actual work status
        time_entries = await time_entry_service.get_user_entries_for_date(user.id, target_date)

        # Determine status and emoji
        status = 'no_plan'
        status_emoji = None
        statuses = []

        if day_status:
            if day_status.status == StatusType.SICK:
                status = 'sick'
                status_emoji = '🤒'
                statuses = ['sick']
            elif day_status.status == StatusType.VACATION:
                status = 'vacation'
                status_emoji = '🏖️'
                statuses = ['vacation']
            elif day_status.status == StatusType.EXCUSED:
                status = 'excused'
                status_emoji = '✅'
                statuses = ['excused']
        else:
            # Combine workplace plans and actual time entries
            has_office_plan = user.id in office_user_ids
            has_remote_plan = user.id in remote_user_ids

            # Check time entries for actual work
            has_office_entry = any(e.workplace.value == 'office' for e in time_entries) if time_entries else False
            has_remote_entry = any(e.workplace.value == 'remote' for e in time_entries) if time_entries else False

            # Combine: if there's a plan OR actual entry
            has_office = has_office_plan or has_office_entry
            has_remote = has_remote_plan or has_remote_entry

            if has_office and has_remote:
                status = 'office/remote'
                status_emoji = '🏢/🏠'
                statuses = ['office', 'remote']
            elif has_office:
                status = 'office'
                status_emoji = '🏢'
                statuses = ['office']
            elif has_remote:
                status = 'remote'
                status_emoji = '🏠'
                statuses = ['remote']

        employees_with_status.append(EmployeeWithStatus(
            user_id=user.id,
            first_name=user.profile.first_name,
            last_name=user.profile.last_name,
            avatar_url=user.profile.avatar_url,
            position=user.profile.position,
            status=status,
            status_emoji=status_emoji,
            statuses=statuses if statuses else None,
        ))

    return AllEmployeesStatusResponse(
        date=target_date,
        employees=employees_with_status
    )
