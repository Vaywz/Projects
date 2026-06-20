import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query

from app.models.change_request import ChangeRequestStatus, ChangeRequestType

logger = logging.getLogger(__name__)
from app.schemas.change_request import (
    ChangeRequestCreate,
    ChangeRequestResolve,
    ChangeRequestResponse,
    ChangeRequestListResponse,
)
from app.services.change_request_service import ChangeRequestService
from app.services.notification_service import NotificationService
from app.services.time_entry_service import TimeEntryService
from .deps import DbSession, CurrentUser, CurrentAdmin

router = APIRouter()


def _to_response(request, monthly_hours=None, monthly_limit=None, weekly_hours=None) -> ChangeRequestResponse:
    """Convert model to response schema."""
    employee_name = None
    employee_email = None
    if request.user and request.user.profile:
        employee_name = f"{request.user.profile.first_name} {request.user.profile.last_name}"
        employee_email = request.user.email
    elif request.user:
        employee_email = request.user.email

    return ChangeRequestResponse(
        id=request.id,
        user_id=request.user_id,
        request_type=request.request_type,
        time_entry_id=request.time_entry_id,
        vacation_id=request.vacation_id,
        day_status_id=request.day_status_id,
        date=request.date,
        date_to=request.date_to,
        start_time=request.start_time,
        end_time=request.end_time,
        break_minutes=request.break_minutes,
        workplace=request.workplace,
        comment=request.comment,
        reason=request.reason,
        status=request.status,
        admin_id=request.admin_id,
        admin_comment=request.admin_comment,
        resolved_at=request.resolved_at,
        created_at=request.created_at,
        updated_at=request.updated_at,
        employee_name=employee_name,
        employee_email=employee_email,
        monthly_hours=monthly_hours,
        monthly_limit=monthly_limit,
        weekly_hours=weekly_hours,
    )


@router.get("/my", response_model=List[ChangeRequestResponse])
async def get_my_requests(
    status: Optional[ChangeRequestStatus] = None,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get current user's change requests."""
    service = ChangeRequestService(db)
    requests = await service.get_user_requests(current_user.id, status)
    return [_to_response(r) for r in requests]


@router.post("", response_model=ChangeRequestResponse)
async def create_request(
    data: ChangeRequestCreate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Create a new change request."""
    from fastapi import HTTPException

    # Validate time overlap for ADD and EDIT requests
    if data.request_type in [ChangeRequestType.ADD, ChangeRequestType.EDIT] and data.start_time and data.end_time:
        time_entry_service = TimeEntryService(db)
        existing_entries = await time_entry_service.get_user_entries_for_date(
            current_user.id, data.date
        )

        # Check for overlaps with existing entries (exclude the entry being edited)
        new_start = data.start_time.hour * 60 + data.start_time.minute
        new_end = data.end_time.hour * 60 + data.end_time.minute

        for entry in existing_entries:
            # Skip the entry being edited
            if data.request_type == ChangeRequestType.EDIT and entry.id == data.time_entry_id:
                continue

            entry_start = entry.start_time.hour * 60 + entry.start_time.minute
            entry_end = entry.end_time.hour * 60 + entry.end_time.minute

            # Check overlap: new_start < entry_end AND new_end > entry_start
            if new_start < entry_end and new_end > entry_start:
                raise HTTPException(
                    status_code=400,
                    detail="Time entry overlaps with existing entry"
                )

        # Also check against pending change requests for the same user/date
        from sqlalchemy import select, and_
        from app.models.change_request import ChangeRequest
        pending_result = await db.execute(
            select(ChangeRequest).where(and_(
                ChangeRequest.user_id == current_user.id,
                ChangeRequest.date == data.date,
                ChangeRequest.status == ChangeRequestStatus.PENDING,
                ChangeRequest.request_type.in_([ChangeRequestType.ADD, ChangeRequestType.EDIT]),
                ChangeRequest.start_time.isnot(None),
                ChangeRequest.end_time.isnot(None),
            ))
        )
        pending_requests = list(pending_result.scalars().all())

        for pr in pending_requests:
            pr_start = pr.start_time.hour * 60 + pr.start_time.minute
            pr_end = pr.end_time.hour * 60 + pr.end_time.minute
            if new_start < pr_end and new_end > pr_start:
                raise HTTPException(
                    status_code=400,
                    detail="Time entry overlaps with a pending change request"
                )

    service = ChangeRequestService(db)
    request = await service.create(current_user.id, data)

    notification_service = NotificationService(db)
    employee_name = current_user.profile.full_name if current_user.profile else current_user.email

    # Notify admins about the new change request
    try:
        await notification_service.notify_admins_change_request(
            employee_name=employee_name,
            request_type=data.request_type.value,
            request_id=request.id,
            requesting_user_id=current_user.id,
            request_date=str(data.date),
            reason=data.reason,
        )
    except Exception as e:
        logger.error(f"Failed to notify admins about change request {request.id}: {e}")

    # Check for potential overtime if this is a time entry add/edit request
    if data.request_type in [ChangeRequestType.ADD, ChangeRequestType.EDIT] and data.start_time and data.end_time:
        try:
            time_entry_service = TimeEntryService(db)

            # Calculate the new entry hours
            start_minutes = data.start_time.hour * 60 + data.start_time.minute
            end_minutes = data.end_time.hour * 60 + data.end_time.minute
            break_mins = data.break_minutes or 0
            new_entry_hours = (end_minutes - start_minutes - break_mins) / 60

            # Check weekly hours
            current_weekly_hours = await time_entry_service.get_weekly_hours(
                current_user.id, data.date
            )
            projected_weekly = current_weekly_hours + new_entry_hours
            if projected_weekly > 40:
                await notification_service.notify_admins_overtime_warning(
                    employee_name=employee_name,
                    employee_id=current_user.id,
                    request_id=request.id,
                    warning_type="weekly",
                    current_hours=current_weekly_hours,
                    limit_hours=40,
                    projected_hours=projected_weekly,
                )

            # Check monthly hours
            current_monthly_hours = await time_entry_service.get_monthly_hours(
                current_user.id, data.date
            )
            monthly_limit = await TimeEntryService.get_monthly_hours_limit_with_holidays(
                db, data.date.year, data.date.month
            )
            projected_monthly = current_monthly_hours + new_entry_hours
            if projected_monthly > monthly_limit:
                await notification_service.notify_admins_overtime_warning(
                    employee_name=employee_name,
                    employee_id=current_user.id,
                    request_id=request.id,
                    warning_type="monthly",
                    current_hours=current_monthly_hours,
                    limit_hours=monthly_limit,
                    projected_hours=projected_monthly,
                )
        except Exception as e:
            logger.error(f"Failed to check overtime for change request {request.id}: {e}")

    return _to_response(request)


@router.delete("/{request_id}")
async def delete_request(
    request_id: int,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Delete a pending change request."""
    service = ChangeRequestService(db)
    deleted = await service.delete(request_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Request not found or cannot be deleted")
    return {"message": "Request deleted"}


# Admin endpoints
@router.get("/admin/all", response_model=ChangeRequestListResponse)
async def get_all_requests(
    status: Optional[ChangeRequestStatus] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin_user: CurrentAdmin = None,
    db: DbSession = None
):
    """Get all change requests (admin only)."""
    service = ChangeRequestService(db)
    time_entry_service = TimeEntryService(db)
    requests = await service.get_all_requests(status, limit, offset)
    total = await service.get_total_count(status)
    pending_count = await service.get_pending_count()

    # Calculate cumulative hours BEFORE each change request entry.
    # weekly_hours/monthly_hours = hours that existed before this entry (not including it).
    # Frontend always adds reqHours to determine if THIS entry crosses the limit.
    from datetime import timedelta, time as dt_time
    import calendar

    def _calc_request_hours(r):
        if not r.start_time or not r.end_time:
            return 0.0
        start_mins = r.start_time.hour * 60 + r.start_time.minute
        end_mins = r.end_time.hour * 60 + r.end_time.minute
        return (end_mins - start_mins - (r.break_minutes or 0)) / 60

    # --- Step 1: Cumulative pending hours (for pending requests, preceding pending entries) ---
    pending_reqs = [r for r in requests if r.status == ChangeRequestStatus.PENDING and r.start_time and r.end_time and r.date]
    pending_reqs.sort(key=lambda r: (r.user_id, r.date, r.start_time or dt_time(0, 0), r.id))

    preceding_pending_weekly: dict = {}   # request.id -> sum of preceding pending hours in same week
    preceding_pending_monthly: dict = {}  # request.id -> sum of preceding pending hours in same month
    user_week_running: dict = {}
    user_month_running: dict = {}

    for r in pending_reqs:
        week_start = r.date - timedelta(days=r.date.weekday())
        wk = (r.user_id, week_start)
        mk = (r.user_id, r.date.year, r.date.month)
        preceding_pending_weekly[r.id] = user_week_running.get(wk, 0.0)
        preceding_pending_monthly[r.id] = user_month_running.get(mk, 0.0)
        req_hours = _calc_request_hours(r)
        user_week_running[wk] = user_week_running.get(wk, 0.0) + req_hours
        user_month_running[mk] = user_month_running.get(mk, 0.0) + req_hours

    # --- Step 2: Cache approved time entries per user/week and user/month ---
    week_entries_cache: dict = {}   # (user_id, week_start) -> list of entries sorted by (date, start_time)
    month_entries_cache: dict = {}  # (user_id, year, month) -> list of entries sorted by (date, start_time)

    responses = []
    for r in requests:
        monthly_hours = None
        monthly_limit = None
        weekly_hours = None
        try:
            if r.start_time and r.end_time and r.date:
                monthly_limit = await TimeEntryService.get_monthly_hours_limit_with_holidays(db, r.date.year, r.date.month)

                # Get/cache weekly entries
                week_start = r.date - timedelta(days=r.date.weekday())
                week_end = week_start + timedelta(days=6)
                wk_key = (r.user_id, week_start)
                if wk_key not in week_entries_cache:
                    entries = await time_entry_service.get_user_entries_for_range(r.user_id, week_start, week_end)
                    week_entries_cache[wk_key] = list(entries)
                week_entries = week_entries_cache[wk_key]

                # Get/cache monthly entries
                month_start_d = r.date.replace(day=1)
                last_day = calendar.monthrange(r.date.year, r.date.month)[1]
                month_end_d = r.date.replace(day=last_day)
                mk_key = (r.user_id, r.date.year, r.date.month)
                if mk_key not in month_entries_cache:
                    entries = await time_entry_service.get_user_entries_for_range(r.user_id, month_start_d, month_end_d)
                    month_entries_cache[mk_key] = list(entries)
                month_entries = month_entries_cache[mk_key]

                if r.status == ChangeRequestStatus.PENDING:
                    # Pending: entry not in time_entries table yet
                    # hours_before = all approved entries + preceding pending requests
                    all_weekly = sum(e.duration_minutes for e in week_entries) / 60
                    all_monthly = sum(e.duration_minutes for e in month_entries) / 60
                    weekly_hours = all_weekly + preceding_pending_weekly.get(r.id, 0.0)
                    monthly_hours = all_monthly + preceding_pending_monthly.get(r.id, 0.0)
                else:
                    # Approved: entry IS in time_entries table
                    # hours_before = approved entries chronologically before this one
                    r_time = r.start_time or dt_time(0, 0)
                    weekly_hours = sum(
                        e.duration_minutes for e in week_entries
                        if e.date < r.date or (e.date == r.date and (e.start_time or dt_time(0, 0)) < r_time)
                    ) / 60
                    monthly_hours = sum(
                        e.duration_minutes for e in month_entries
                        if e.date < r.date or (e.date == r.date and (e.start_time or dt_time(0, 0)) < r_time)
                    ) / 60
        except Exception:
            pass
        responses.append(_to_response(r, monthly_hours=monthly_hours, monthly_limit=monthly_limit, weekly_hours=weekly_hours))

    return ChangeRequestListResponse(
        requests=responses,
        total=total,
        pending_count=pending_count,
    )


@router.get("/admin/pending-count")
async def get_pending_count(
    admin_user: CurrentAdmin = None,
    db: DbSession = None
):
    """Get count of pending requests (admin only)."""
    service = ChangeRequestService(db)
    count = await service.get_pending_count()
    return {"pending_count": count}


@router.put("/admin/{request_id}", response_model=ChangeRequestResponse)
async def resolve_request(
    request_id: int,
    data: ChangeRequestResolve,
    admin_user: CurrentAdmin = None,
    db: DbSession = None
):
    """Approve or reject a change request (admin only)."""
    service = ChangeRequestService(db)
    request = await service.resolve(request_id, admin_user.id, data)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found or already resolved")

    notification_service = NotificationService(db)
    try:
        await notification_service.notify_requester_change_request_resolved(request)
    except Exception as e:
        logger.error(f"Failed to notify requester about resolved change request {request_id}: {e}")

    return _to_response(request)


@router.delete("/admin/{request_id}")
async def admin_delete_request(
    request_id: int,
    admin_user: CurrentAdmin = None,
    db: DbSession = None
):
    """Delete any change request (admin only)."""
    service = ChangeRequestService(db)
    deleted = await service.admin_delete(request_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"message": "Request deleted"}


@router.post("/admin/bulk-delete")
async def admin_bulk_delete(
    data: dict,
    admin_user: CurrentAdmin = None,
    db: DbSession = None
):
    """Delete multiple change requests (admin only)."""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    service = ChangeRequestService(db)
    deleted_count = 0
    for rid in ids:
        if await service.admin_delete(rid):
            deleted_count += 1
    return {"deleted": deleted_count}
