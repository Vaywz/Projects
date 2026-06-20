import json
import logging
from datetime import datetime, date, timedelta
from typing import List, Optional, Tuple
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.notification import Notification, NotificationSettings, NotificationType
from app.models.company_setting import CompanySetting
from app.models.user import User, UserRole
from app.models.employee_profile import EmployeeProfile
from app.models.day_status import DayStatus, StatusType
from app.models.vacation import Vacation, VacationStatus
from app.services.email_service import EmailService
from app.tasks.notification_tasks import (
    send_change_request_admin_email,
    send_change_request_resolution_email,
)

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_notification(
        self,
        user_id: int,
        notification_type: NotificationType,
        title: str,
        message: str,
        related_user_id: Optional[int] = None,
        related_request_id: Optional[int] = None,
    ) -> Notification:
        """Create a new notification for a user."""
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            related_user_id=related_user_id,
            related_request_id=related_request_id,
        )
        self.db.add(notification)
        await self.db.flush()
        await self.db.refresh(notification)
        return notification

    async def _is_email_enabled(self) -> bool:
        """Check if email notifications are enabled in company settings."""
        result = await self.db.execute(
            select(CompanySetting).where(CompanySetting.key == "email_notifications_enabled")
        )
        setting = result.scalar_one_or_none()
        if setting is None:
            return True  # enabled by default
        return setting.value.lower() == "true" if setting.value else True

    async def _get_user_notification_settings(self, user_id: int) -> Optional[NotificationSettings]:
        """Get notification settings for a user, or None if not set (defaults apply)."""
        result = await self.db.execute(
            select(NotificationSettings).where(NotificationSettings.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def _is_email_enabled_for_user(self, user_id: int, setting_field: str) -> bool:
        """Check if a specific email notification is enabled for a user."""
        settings = await self._get_user_notification_settings(user_id)
        if settings is None:
            return True  # defaults are True
        return getattr(settings, setting_field, True)

    async def get_admin_user_ids(self) -> List[int]:
        """Get all admin user IDs."""
        result = await self.db.execute(
            select(User.id).where(User.role == UserRole.ADMIN, User.is_active == True)
        )
        return [row[0] for row in result.fetchall()]

    async def get_admin_users_with_profiles(self) -> List[Tuple[User, Optional[EmployeeProfile]]]:
        """Get all admin users with their profiles."""
        result = await self.db.execute(
            select(User)
            .options(joinedload(User.profile))
            .where(User.role == UserRole.ADMIN, User.is_active == True)
        )
        users = result.unique().scalars().all()
        return [(user, user.profile) for user in users]

    async def notify_admins_change_request(
        self,
        employee_name: str,
        request_type: str,
        request_id: int,
        requesting_user_id: int,
        request_date: str = "",
        reason: str = "",
    ) -> None:
        """Notify all admins about a new change request."""
        # Check if notification for this request already exists (prevent duplicates)
        existing = await self.db.execute(
            select(Notification).where(
                Notification.related_request_id == request_id,
                Notification.type == NotificationType.CHANGE_REQUEST,
            )
        )
        if existing.scalar_one_or_none():
            logger.info(f"Notification for change request {request_id} already exists, skipping")
            return

        admins = await self.get_admin_users_with_profiles()
        logger.info(f"Notifying {len(admins)} admins about change request {request_id} from {employee_name}")

        if not admins:
            logger.warning("No admin users found to notify about change request")
            return

        # Store data as JSON for frontend translation
        title = "notification.changeRequest.title"
        message = json.dumps({"employee_name": employee_name, "request_type": request_type})

        for user, profile in admins:
            # Create in-app notification
            logger.info(f"Creating notification for admin {user.id} ({user.email})")
            await self.create_notification(
                user_id=user.id,
                notification_type=NotificationType.CHANGE_REQUEST,
                title=title,
                message=message,
                related_user_id=requesting_user_id,
                related_request_id=request_id,
            )

        # Send emails in background (non-blocking)
        email_enabled = await self._is_email_enabled()
        email_service = EmailService()
        if email_enabled and email_service.is_configured():
            for user, profile in admins:
                if not await self._is_email_enabled_for_user(user.id, "email_change_request"):
                    logger.info(f"Skipping email to {user.email} - disabled in settings")
                    continue

                admin_name = profile.full_name if profile else user.email
                email_to_use = profile.work_email if profile and profile.work_email else user.email
                send_change_request_admin_email.delay(
                    email_to_use,
                    admin_name,
                    employee_name,
                    request_type,
                    request_date,
                    reason,
                )

    async def notify_requester_change_request_resolved(self, request) -> None:
        """Notify the requester when their change request is approved or rejected."""
        email_enabled = await self._is_email_enabled()
        email_service = EmailService()
        if not email_enabled or not email_service.is_configured():
            return

        user = request.user
        profile = user.profile if user else None
        if not user:
            logger.warning(f"Cannot send resolution email for change request {request.id}: user missing")
            return

        if not await self._is_email_enabled_for_user(user.id, "email_change_request"):
            logger.info(f"Skipping resolution email for {user.email} - disabled in settings")
            return

        employee_name = profile.full_name if profile else user.email
        email_to_use = profile.work_email if profile and profile.work_email else user.email

        send_change_request_resolution_email.delay(
            email_to_use,
            employee_name,
            request.status.value if hasattr(request.status, "value") else str(request.status),
            request.request_type.value if hasattr(request.request_type, "value") else str(request.request_type),
            request.date.strftime("%d.%m.%Y"),
            request.date_to.strftime("%d.%m.%Y") if request.date_to else None,
            request.start_time.strftime("%H:%M") if request.start_time else None,
            request.end_time.strftime("%H:%M") if request.end_time else None,
            request.break_minutes,
            request.workplace,
            request.comment,
            request.reason,
            request.admin_comment,
        )

    async def check_and_create_birthday_notifications(self) -> int:
        """Check for upcoming birthdays and create notifications for admins.

        Creates notifications:
        - 2 days before birthday
        - On the birthday

        Returns the number of notifications created.
        """
        today = date.today()
        in_two_days = today + timedelta(days=2)

        admin_ids = await self.get_admin_user_ids()
        if not admin_ids:
            return 0

        count = 0

        # Find employees with birthdays today or in 2 days
        result = await self.db.execute(
            select(EmployeeProfile, User).join(User).where(
                User.is_active == True,
                EmployeeProfile.birthday.isnot(None),
                or_(
                    EmployeeProfile.employment_end_date.is_(None),
                    EmployeeProfile.employment_end_date > today,
                )
            )
        )

        for profile, user in result.fetchall():
            if profile.birthday is None:
                continue

            # Check if birthday matches (month and day)
            birthday_this_year = profile.birthday.replace(year=today.year)

            is_today = (birthday_this_year.month == today.month and
                       birthday_this_year.day == today.day)
            is_in_two_days = (birthday_this_year.month == in_two_days.month and
                            birthday_this_year.day == in_two_days.day)

            if is_today:
                title = f"🎂 Birthday Today!"
                message = f"{profile.full_name} has a birthday today!"

                for admin_id in admin_ids:
                    # Check if notification already exists for today
                    existing = await self._check_existing_notification(
                        admin_id, NotificationType.BIRTHDAY, user.id, today
                    )
                    if not existing:
                        await self.create_notification(
                            user_id=admin_id,
                            notification_type=NotificationType.BIRTHDAY,
                            title=title,
                            message=message,
                            related_user_id=user.id,
                        )
                        count += 1

            elif is_in_two_days:
                title = f"🎂 Upcoming Birthday"
                message = f"{profile.full_name} will have a birthday in 2 days ({birthday_this_year.strftime('%B %d')})"

                for admin_id in admin_ids:
                    existing = await self._check_existing_notification(
                        admin_id, NotificationType.BIRTHDAY, user.id, today
                    )
                    if not existing:
                        await self.create_notification(
                            user_id=admin_id,
                            notification_type=NotificationType.BIRTHDAY,
                            title=title,
                            message=message,
                            related_user_id=user.id,
                        )
                        count += 1

        return count

    async def check_and_create_name_day_notifications(self) -> int:
        """Check for upcoming name days and create notifications for admins.

        Creates notifications:
        - 2 days before name day
        - On the name day

        Returns the number of notifications created.
        """
        today = date.today()
        in_two_days = today + timedelta(days=2)

        admin_ids = await self.get_admin_user_ids()
        if not admin_ids:
            return 0

        count = 0

        # Find employees with name days today or in 2 days
        result = await self.db.execute(
            select(EmployeeProfile, User).join(User).where(
                User.is_active == True,
                EmployeeProfile.name_day.isnot(None),
                or_(
                    EmployeeProfile.employment_end_date.is_(None),
                    EmployeeProfile.employment_end_date > today,
                )
            )
        )

        for profile, user in result.fetchall():
            if profile.name_day is None:
                continue

            # Check if name day matches (month and day)
            name_day_this_year = profile.name_day.replace(year=today.year)

            is_today = (name_day_this_year.month == today.month and
                       name_day_this_year.day == today.day)
            is_in_two_days = (name_day_this_year.month == in_two_days.month and
                            name_day_this_year.day == in_two_days.day)

            if is_today:
                title = f"🎉 Name Day Today!"
                message = f"{profile.full_name} has a name day today!"

                for admin_id in admin_ids:
                    existing = await self._check_existing_notification(
                        admin_id, NotificationType.NAME_DAY, user.id, today
                    )
                    if not existing:
                        await self.create_notification(
                            user_id=admin_id,
                            notification_type=NotificationType.NAME_DAY,
                            title=title,
                            message=message,
                            related_user_id=user.id,
                        )
                        count += 1

            elif is_in_two_days:
                title = f"🎉 Upcoming Name Day"
                message = f"{profile.full_name} will have a name day in 2 days ({name_day_this_year.strftime('%B %d')})"

                for admin_id in admin_ids:
                    existing = await self._check_existing_notification(
                        admin_id, NotificationType.NAME_DAY, user.id, today
                    )
                    if not existing:
                        await self.create_notification(
                            user_id=admin_id,
                            notification_type=NotificationType.NAME_DAY,
                            title=title,
                            message=message,
                            related_user_id=user.id,
                        )
                        count += 1

        return count

    async def _user_has_sick_or_vacation_this_week(self, user_id: int, today: date) -> bool:
        """Check if user has sick leave or vacation for this week."""
        # Calculate week dates (Monday to Friday)
        week_start = today - timedelta(days=today.weekday())  # Monday
        week_end = week_start + timedelta(days=4)  # Friday

        # Check for sick days this week
        sick_result = await self.db.execute(
            select(DayStatus).where(
                DayStatus.user_id == user_id,
                DayStatus.status == StatusType.SICK,
                DayStatus.date >= week_start,
                DayStatus.date <= week_end,
            )
        )
        if sick_result.scalar_one_or_none():
            return True

        # Check for approved vacations that overlap this week
        vacation_result = await self.db.execute(
            select(Vacation).where(
                Vacation.user_id == user_id,
                Vacation.status == VacationStatus.APPROVED,
                Vacation.date_from <= week_end,
                Vacation.date_to >= week_start,
            )
        )
        if vacation_result.scalar_one_or_none():
            return True

        return False

    async def create_weekly_reminder_for_employees(self) -> int:
        """Create weekly planning reminder for all employees (not admins).

        Should be called on Monday morning.
        Skips users who have sick leave or vacation this week.
        Skips admin users - they fill in calendar if they want.

        Returns the number of notifications created.
        """
        today = date.today()

        # Only create reminders on Monday
        if today.weekday() != 0:
            return 0

        # Get only non-admin users (employees)
        result = await self.db.execute(
            select(User).options(joinedload(User.profile)).where(
                User.is_active == True,
                User.role != UserRole.ADMIN,  # Exclude admins
            )
        )
        users = result.unique().scalars().all()

        email_service = EmailService()
        email_enabled = await self._is_email_enabled()
        week_start = today
        week_end = today + timedelta(days=4)

        count = 0
        title = "📅 Weekly Planning Reminder"
        message = "Don't forget to plan your workplace schedule for this week!"

        for user in users:
            if user.profile:
                if user.profile.employment_start_date and week_end < user.profile.employment_start_date:
                    logger.info(f"Skipping weekly reminder for {user.email} - employment has not started")
                    continue
                if user.profile.employment_end_date and week_start >= user.profile.employment_end_date:
                    logger.info(f"Skipping weekly reminder for {user.email} - employment inactive for this week")
                    continue

            # Skip users with sick leave or vacation
            if await self._user_has_sick_or_vacation_this_week(user.id, today):
                logger.info(f"Skipping weekly reminder for {user.email} - has sick/vacation")
                continue

            # Check if already reminded today
            existing = await self._check_existing_notification(
                user.id, NotificationType.WEEKLY_REMINDER, None, today
            )
            if not existing:
                # Create in-app notification
                await self.create_notification(
                    user_id=user.id,
                    notification_type=NotificationType.WEEKLY_REMINDER,
                    title=title,
                    message=message,
                )

                # Send email notification (check user preference)
                if email_enabled and email_service.is_configured():
                    user_email_enabled = await self._is_email_enabled_for_user(user.id, "email_weekly_reminder")
                    if user_email_enabled:
                        user_name = user.profile.full_name if user.profile else user.email
                        email_to_use = user.profile.work_email if user.profile and user.profile.work_email else user.email
                        try:
                            await email_service.send_weekly_planning_reminder(
                                to_email=email_to_use,
                                employee_name=user_name,
                                week_start=week_start.strftime('%d.%m.%Y'),
                                week_end=week_end.strftime('%d.%m.%Y'),
                            )
                        except Exception as e:
                            logger.error(f"Failed to send weekly reminder email to {email_to_use}: {e}")

                count += 1

        return count

    async def _check_existing_notification(
        self,
        user_id: int,
        notification_type: NotificationType,
        related_user_id: Optional[int],
        check_date: date,
    ) -> bool:
        """Check if a notification of this type already exists for today."""
        query = select(Notification).where(
            Notification.user_id == user_id,
            Notification.type == notification_type,
            Notification.created_at >= datetime.combine(check_date, datetime.min.time()),
            Notification.created_at < datetime.combine(check_date + timedelta(days=1), datetime.min.time()),
        )

        if related_user_id is not None:
            query = query.where(Notification.related_user_id == related_user_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None

    async def notify_admins_overtime_warning(
        self,
        employee_name: str,
        employee_id: int,
        request_id: int,
        warning_type: str,  # "weekly" or "monthly"
        current_hours: float,
        limit_hours: int,
        projected_hours: float,
    ) -> None:
        """Notify admins about potential overtime if a change request is approved."""
        # Check if overtime notification for this request already exists (prevent duplicates)
        existing = await self.db.execute(
            select(Notification).where(
                Notification.related_request_id == request_id,
                Notification.type == NotificationType.OVERTIME_WARNING,
                Notification.message.contains(warning_type),
            )
        )
        if existing.scalar_one_or_none():
            logger.info(f"Overtime warning ({warning_type}) for request {request_id} already exists, skipping")
            return

        admins = await self.get_admin_users_with_profiles()
        if not admins:
            return

        if warning_type == "weekly":
            title = "notification.overtime.weeklyTitle"
            message = json.dumps({
                "employee_name": employee_name,
                "current_hours": round(current_hours, 1),
                "limit_hours": limit_hours,
                "projected_hours": round(projected_hours, 1),
                "warning_type": "weekly"
            })
        else:  # monthly
            title = "notification.overtime.monthlyTitle"
            message = json.dumps({
                "employee_name": employee_name,
                "current_hours": round(current_hours, 1),
                "limit_hours": limit_hours,
                "projected_hours": round(projected_hours, 1),
                "warning_type": "monthly"
            })

        for user, profile in admins:
            await self.create_notification(
                user_id=user.id,
                notification_type=NotificationType.OVERTIME_WARNING,
                title=title,
                message=message,
                related_user_id=employee_id,
                related_request_id=request_id,
            )
