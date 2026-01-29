import json
import logging
from datetime import datetime, date, timedelta
from typing import List, Optional, Tuple
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.notification import Notification, NotificationSettings, NotificationType
from app.models.user import User, UserRole
from app.models.employee_profile import EmployeeProfile
from app.models.day_status import DayStatus, StatusType
from app.models.vacation import Vacation, VacationStatus
from app.services.email_service import EmailService

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
        admins = await self.get_admin_users_with_profiles()

        # Store data as JSON for frontend translation
        title = "notification.changeRequest.title"
        message = json.dumps({"employee_name": employee_name, "request_type": request_type})

        email_service = EmailService()

        for user, profile in admins:
            # Create in-app notification
            await self.create_notification(
                user_id=user.id,
                notification_type=NotificationType.CHANGE_REQUEST,
                title=title,
                message=message,
                related_user_id=requesting_user_id,
                related_request_id=request_id,
            )

            # Send email notification
            if email_service.smtp_user and email_service.smtp_password:
                admin_name = profile.full_name if profile else user.email
                try:
                    await email_service.send_change_request_notification(
                        to_email=user.email,
                        admin_name=admin_name,
                        employee_name=employee_name,
                        request_type=request_type,
                        request_date=request_date,
                        reason=reason,
                    )
                except Exception as e:
                    logger.error(f"Failed to send email to {user.email}: {e}")

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
                EmployeeProfile.birthday.isnot(None)
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
                EmployeeProfile.name_day.isnot(None)
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
        """Create weekly planning reminder for all employees.

        Should be called on Monday morning.
        Skips users who have sick leave or vacation this week.

        Returns the number of notifications created.
        """
        today = date.today()

        # Only create reminders on Monday
        if today.weekday() != 0:
            return 0

        result = await self.db.execute(
            select(User).options(joinedload(User.profile)).where(User.is_active == True)
        )
        users = result.unique().scalars().all()

        email_service = EmailService()
        week_start = today
        week_end = today + timedelta(days=4)

        count = 0
        title = "📅 Weekly Planning Reminder"
        message = "Don't forget to plan your workplace schedule for this week!"

        for user in users:
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

                # Send email notification
                if email_service.smtp_user and email_service.smtp_password:
                    user_name = user.profile.full_name if user.profile else user.email
                    try:
                        await email_service.send_weekly_planning_reminder(
                            to_email=user.email,
                            employee_name=user_name,
                            week_start=week_start.strftime('%d.%m.%Y'),
                            week_end=week_end.strftime('%d.%m.%Y'),
                        )
                    except Exception as e:
                        logger.error(f"Failed to send weekly reminder email to {user.email}: {e}")

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