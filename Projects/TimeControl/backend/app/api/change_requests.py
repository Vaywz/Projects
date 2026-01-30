from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query

from app.models.change_request import ChangeRequestStatus
from app.schemas.change_request import (
    ChangeRequestCreate,
    ChangeRequestResolve,
    ChangeRequestResponse,
    ChangeRequestListResponse,
)
from app.services.change_request_service import ChangeRequestService
from app.services.notification_service import NotificationService
from .deps import DbSession, CurrentUser, CurrentAdmin

router = APIRouter()


def _to_response(request) -> ChangeRequestResponse:
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
    service = ChangeRequestService(db)
    request = await service.create(current_user.id, data)

    # Notify admins about the new change request
    notification_service = NotificationService(db)
    employee_name = current_user.profile.full_name if current_user.profile else current_user.email
    await notification_service.notify_admins_change_request(
        employee_name=employee_name,
        request_type=data.request_type.value,
        request_id=request.id,
        requesting_user_id=current_user.id,
        request_date=str(data.date),
        reason=data.reason,
    )

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
    requests = await service.get_all_requests(status, limit, offset)
    total = await service.get_total_count(status)
    pending_count = await service.get_pending_count()
    return ChangeRequestListResponse(
        requests=[_to_response(r) for r in requests],
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
    return _to_response(request)