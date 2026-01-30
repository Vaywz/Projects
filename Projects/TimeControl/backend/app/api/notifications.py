from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, update, func

from app.models.notification import Notification, NotificationSettings, NotificationType
from app.services.notification_service import NotificationService
from .deps import DbSession, CurrentUser, CurrentAdmin

router = APIRouter()


class NotificationResponse(BaseModel):
    id: int
    type: NotificationType
    title: str
    message: str
    is_read: bool
    related_user_id: Optional[int]
    related_request_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationSettingsResponse(BaseModel):
    email_birthday: bool
    email_name_day: bool
    email_change_request: bool
    email_weekly_reminder: bool
    app_birthday: bool
    app_name_day: bool
    app_change_request: bool
    app_weekly_reminder: bool

    class Config:
        from_attributes = True


class NotificationSettingsUpdate(BaseModel):
    email_birthday: Optional[bool] = None
    email_name_day: Optional[bool] = None
    email_change_request: Optional[bool] = None
    email_weekly_reminder: Optional[bool] = None
    app_birthday: Optional[bool] = None
    app_name_day: Optional[bool] = None
    app_change_request: Optional[bool] = None
    app_weekly_reminder: Optional[bool] = None


class UnreadCountResponse(BaseModel):
    count: int


@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, le=100),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get user notifications."""
    query = select(Notification).where(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(limit)

    if unread_only:
        query = query.where(Notification.is_read == False)

    result = await db.execute(query)
    notifications = result.scalars().all()
    return notifications


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get count of unread notifications."""
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
    )
    count = result.scalar() or 0
    return {"count": count}


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Mark a notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    notification.is_read = True
    await db.flush()
    return {"message": "Marked as read"}


@router.post("/read-all")
async def mark_all_as_read(
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Mark all notifications as read."""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    return {"message": "All notifications marked as read"}


@router.get("/settings", response_model=NotificationSettingsResponse)
async def get_notification_settings(
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get user notification settings."""
    result = await db.execute(
        select(NotificationSettings).where(
            NotificationSettings.user_id == current_user.id
        )
    )
    settings = result.scalar_one_or_none()

    if not settings:
        # Create default settings
        settings = NotificationSettings(user_id=current_user.id)
        db.add(settings)
        await db.flush()
        await db.refresh(settings)

    return settings


@router.put("/settings", response_model=NotificationSettingsResponse)
async def update_notification_settings(
    settings_data: NotificationSettingsUpdate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Update user notification settings."""
    result = await db.execute(
        select(NotificationSettings).where(
            NotificationSettings.user_id == current_user.id
        )
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = NotificationSettings(user_id=current_user.id)
        db.add(settings)

    update_data = settings_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    await db.flush()
    await db.refresh(settings)
    return settings


class NotificationCheckResponse(BaseModel):
    birthday_notifications: int
    name_day_notifications: int
    weekly_reminder_notifications: int
    total: int


@router.post("/admin/check-events", response_model=NotificationCheckResponse)
async def check_notification_events(
    admin_user: CurrentAdmin = None,
    db: DbSession = None
):
    """Trigger check for birthday, name day, and weekly reminder notifications.

    This endpoint should be called daily by a cron job or scheduler.
    It checks for:
    - Birthdays (today and in 2 days)
    - Name days (today and in 2 days)
    - Weekly planning reminders (on Monday)
    """
    service = NotificationService(db)

    birthday_count = await service.check_and_create_birthday_notifications()
    name_day_count = await service.check_and_create_name_day_notifications()
    weekly_count = await service.create_weekly_reminder_for_employees()

    return NotificationCheckResponse(
        birthday_notifications=birthday_count,
        name_day_notifications=name_day_count,
        weekly_reminder_notifications=weekly_count,
        total=birthday_count + name_day_count + weekly_count,
    )