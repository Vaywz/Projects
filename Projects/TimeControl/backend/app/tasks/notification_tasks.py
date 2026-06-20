import logging
from datetime import date, timedelta, datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_

from app.core.database import sync_engine
from app.models.user import User, UserRole
from app.models.employee_profile import EmployeeProfile
from app.models.time_entry import TimeEntry
from app.models.day_status import DayStatus, StatusType
from app.models.vacation import Vacation, VacationStatus
from app.models.calendar_day import CalendarDay, DayType
from app.models.workplace_plan import WorkplacePlan
from app.models.notification import Notification, NotificationType, NotificationSettings
from app.services.calendar_service import classify_calendar_date
from app.services.email_service import EmailService
from .celery_app import celery_app

logger = logging.getLogger(__name__)

# Check for missing entries in the last 5 working days (approx 1 week)
DAYS_TO_CHECK = 5
MISSING_ENTRY_EMAIL_MAX_AGE_DAYS = 14


def get_last_n_working_days_sync(session: Session, from_date: date, n: int) -> list:
    """Get the last N working days before (and including) from_date."""
    working_days = []
    current_date = from_date
    max_days_back = 60

    for _ in range(max_days_back):
        if len(working_days) >= n:
            break

        # Check if day exists in calendar
        result = session.execute(
            select(CalendarDay).where(CalendarDay.date == current_date)
        )
        cal_day = result.scalar_one_or_none()

        if cal_day:
            is_working = cal_day.is_working_day
        else:
            is_working = bool(classify_calendar_date(current_date)["is_working_day"])

        if is_working:
            working_days.append(current_date)

        current_date -= timedelta(days=1)

    return working_days


def filter_email_eligible_missing_dates(missing_dates: list, today: date) -> list:
    """Keep missing dates that are still recent enough for email reminders."""
    cutoff_date = today - timedelta(days=MISSING_ENTRY_EMAIL_MAX_AGE_DAYS)
    return [missing_date for missing_date in missing_dates if missing_date > cutoff_date]


def is_employed_on_date(profile: EmployeeProfile, target_date: date) -> bool:
    """Return whether the employee should be treated as employed on target_date."""
    if profile.employment_start_date and target_date < profile.employment_start_date:
        return False
    if profile.employment_end_date and target_date >= profile.employment_end_date:
        return False
    return True


def is_user_on_leave(session: Session, user_id: int, check_date: date) -> bool:
    """Check if user is exempt from time entry reminders on a specific date."""
    # Check day status
    result = session.execute(
        select(DayStatus).where(and_(
            DayStatus.user_id == user_id,
            DayStatus.date == check_date,
            DayStatus.status.in_([
                StatusType.SICK,
                StatusType.VACATION,
                StatusType.EXCUSED,
                StatusType.HOLIDAY,
                StatusType.DAYOFF,
            ])
        ))
    )
    if result.scalar_one_or_none():
        return True

    # Check vacation
    result = session.execute(
        select(Vacation).where(and_(
            Vacation.user_id == user_id,
            Vacation.date_from <= check_date,
            Vacation.date_to >= check_date,
            Vacation.status == VacationStatus.APPROVED
        ))
    )
    if result.scalar_one_or_none():
        return True

    return False


def has_time_entry(session: Session, user_id: int, check_date: date) -> bool:
    """Check if user has any time entries for a date."""
    result = session.execute(
        select(TimeEntry).where(and_(
            TimeEntry.user_id == user_id,
            TimeEntry.date == check_date
        ))
    )
    return result.scalar_one_or_none() is not None


def is_currently_on_leave(session: Session, user_id: int) -> bool:
    """Check if user is currently exempt from time entry reminders."""
    today = date.today()

    # Check day status for today
    result = session.execute(
        select(DayStatus).where(and_(
            DayStatus.user_id == user_id,
            DayStatus.date == today,
            DayStatus.status.in_([
                StatusType.SICK,
                StatusType.VACATION,
                StatusType.EXCUSED,
                StatusType.HOLIDAY,
                StatusType.DAYOFF,
            ])
        ))
    )
    if result.scalar_one_or_none():
        return True

    # Check active vacation
    result = session.execute(
        select(Vacation).where(and_(
            Vacation.user_id == user_id,
            Vacation.date_from <= today,
            Vacation.date_to >= today,
            Vacation.status == VacationStatus.APPROVED
        ))
    )
    if result.scalar_one_or_none():
        return True

    return False


def has_missing_entry_notification_today(session: Session, user_id: int) -> bool:
    """Check if user already has a missing entry notification created today."""
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today + timedelta(days=1), datetime.min.time())

    result = session.execute(
        select(Notification).where(and_(
            Notification.user_id == user_id,
            Notification.type == NotificationType.MISSING_ENTRY,
            Notification.created_at >= today_start,
            Notification.created_at < today_end
        ))
    )
    return result.scalar_one_or_none() is not None


def is_email_enabled_for_user_sync(session: Session, user_id: int, field: str) -> bool:
    """Check if a specific email notification is enabled for a user (sync version)."""
    result = session.execute(
        select(NotificationSettings).where(NotificationSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        return True  # defaults are True
    return getattr(settings, field, True)


def create_missing_entry_notification(session: Session, user_id: int, missing_dates: list) -> Notification:
    """Create in-app notification about missing time entries."""
    dates_str = ", ".join([d.strftime("%d.%m") for d in sorted(missing_dates)])

    notification = Notification(
        user_id=user_id,
        type=NotificationType.MISSING_ENTRY,
        title="notification.missingEntry.title",
        message=f'{{"dates": "{dates_str}", "count": {len(missing_dates)}}}',
    )
    session.add(notification)
    return notification


@celery_app.task(name="app.tasks.notification_tasks.check_missing_entries")
def check_missing_entries():
    """
    Check all active users for missing time entries in the last working days.
    Creates daily in-app notifications until entries are filled.
    """
    logger.info("Starting missing entries check")

    with Session(sync_engine) as session:
        # Get all active employees (skip admins)
        result = session.execute(
            select(User).where(User.is_active == True, User.role == UserRole.EMPLOYEE)
        )
        users = result.scalars().all()

        today = date.today()
        # Start checking from yesterday (not today)
        check_from = today - timedelta(days=1)
        last_working_days = get_last_n_working_days_sync(session, check_from, DAYS_TO_CHECK)

        logger.info(f"Checking {len(users)} users for dates: {last_working_days}")

        notification_count = 0
        for user in users:
            try:
                # Get profile for name and archive/employment checks
                profile_result = session.execute(
                    select(EmployeeProfile).where(EmployeeProfile.user_id == user.id)
                )
                profile = profile_result.scalar_one_or_none()

                if not profile:
                    continue

                if not is_employed_on_date(profile, today):
                    logger.info(f"Skipping user {user.id} - employment inactive on {today}")
                    continue

                # Skip if currently on leave
                if is_currently_on_leave(session, user.id):
                    logger.info(f"Skipping user {user.id} - currently on leave")
                    continue

                # Check each working day
                missing_dates = []
                for work_date in last_working_days:
                    # Skip if on leave that day
                    if is_user_on_leave(session, user.id, work_date):
                        continue

                    # Check if has entries
                    if not has_time_entry(session, user.id, work_date):
                        missing_dates.append(work_date)

                # If any missing entries, send daily notification
                if len(missing_dates) > 0:
                    logger.info(f"User {user.id} missing entries for {missing_dates}")

                    # Check if already notified today
                    if has_missing_entry_notification_today(session, user.id):
                        logger.info(f"User {user.id} already notified today, skipping")
                        continue

                    # Create in-app notification
                    create_missing_entry_notification(session, user.id, missing_dates)
                    notification_count += 1

                    email_missing_dates = filter_email_eligible_missing_dates(missing_dates, today)

                    # Send email notification (check user preference)
                    if not email_missing_dates:
                        logger.info(
                            f"Skipping email for user {user.id} - missing dates are "
                            f"{MISSING_ENTRY_EMAIL_MAX_AGE_DAYS}+ days old"
                        )
                    elif is_email_enabled_for_user_sync(session, user.id, "email_missing_entry"):
                        email_to_use = profile.work_email if profile.work_email else user.email
                        send_notification_email.delay(
                            email_to_use,
                            profile.full_name,
                            [d.isoformat() for d in sorted(email_missing_dates)]
                        )
                    else:
                        logger.info(f"Skipping email for user {user.id} - disabled in settings")

            except Exception as e:
                logger.error(f"Error processing user {user.id}: {str(e)}")
                continue

        # Commit all notifications
        session.commit()

    logger.info(f"Missing entries check completed. Notifications created: {notification_count}")
    return {"status": "completed", "notifications_created": notification_count}


@celery_app.task(name="app.tasks.notification_tasks.send_notification_email")
def send_notification_email(email: str, employee_name: str, missing_dates: list):
    """Send notification email about missing time entries."""
    import asyncio
    from datetime import datetime

    logger.info(f"Sending notification to {email} for dates: {missing_dates}")

    # Convert string dates back to date objects
    dates = [datetime.strptime(d, "%Y-%m-%d").date() for d in missing_dates]
    dates = filter_email_eligible_missing_dates(dates, date.today())

    if not dates:
        logger.info(
            f"Skipping notification to {email} - missing dates are "
            f"{MISSING_ENTRY_EMAIL_MAX_AGE_DAYS}+ days old"
        )
        return {"status": "skipped", "email": email}

    email_service = EmailService()

    # Run async function in sync context
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = False
    try:
        result = loop.run_until_complete(
            email_service.send_missing_entries_notification(email, employee_name, dates)
        )
        if result:
            logger.info(f"Notification sent successfully to {email}")
        else:
            logger.warning(f"Failed to send notification to {email}")
    finally:
        loop.close()

    return {"status": "sent" if result else "failed", "email": email}


@celery_app.task(name="app.tasks.notification_tasks.send_change_request_admin_email")
def send_change_request_admin_email(
    email: str,
    admin_name: str,
    employee_name: str,
    request_type: str,
    request_date: str,
    reason: str,
):
    """Send change request notification to an admin."""
    import asyncio

    logger.info(f"Sending change request notification to admin {email}")

    email_service = EmailService()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            email_service.send_change_request_notification(
                email,
                admin_name,
                employee_name,
                request_type,
                request_date,
                reason,
            )
        )
        if result:
            logger.info(f"Change request notification sent successfully to {email}")
        else:
            logger.warning(f"Failed to send change request notification to {email}")
    finally:
        loop.close()

    return {"status": "sent" if result else "failed", "email": email}


@celery_app.task(name="app.tasks.notification_tasks.send_change_request_resolution_email")
def send_change_request_resolution_email(
    email: str,
    employee_name: str,
    status: str,
    request_type: str,
    request_date: str,
    request_date_to: str | None,
    start_time: str | None,
    end_time: str | None,
    break_minutes: int | None,
    workplace: str | None,
    comment: str | None,
    reason: str,
    admin_comment: str | None,
):
    """Send change request resolution email to the requester."""
    import asyncio

    logger.info(f"Sending change request resolution notification to {email}")

    email_service = EmailService()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            email_service.send_change_request_resolution_notification(
                to_email=email,
                employee_name=employee_name,
                status=status,
                request_type=request_type,
                request_date=request_date,
                request_date_to=request_date_to,
                start_time=start_time,
                end_time=end_time,
                break_minutes=break_minutes,
                workplace=workplace,
                comment=comment,
                reason=reason,
                admin_comment=admin_comment,
            )
        )
        if result:
            logger.info(f"Change request resolution email sent successfully to {email}")
        else:
            logger.warning(f"Failed to send change request resolution email to {email}")
    finally:
        loop.close()

    return {"status": "sent" if result else "failed", "email": email}


def get_week_working_days(session: Session, week_start: date) -> list:
    """Get working days for a week (Monday to Friday)."""
    working_days = []
    for i in range(5):  # Monday to Friday
        day = week_start + timedelta(days=i)
        # Check calendar
        result = session.execute(
            select(CalendarDay).where(CalendarDay.date == day)
        )
        cal_day = result.scalar_one_or_none()

        if cal_day:
            if cal_day.is_working_day:
                working_days.append(day)
        else:
            if classify_calendar_date(day)["is_working_day"]:
                working_days.append(day)

    return working_days


def has_any_workplace_plan(session: Session, user_id: int, days: list) -> bool:
    """Check if user has any workplace plan for the given days."""
    result = session.execute(
        select(WorkplacePlan).where(and_(
            WorkplacePlan.user_id == user_id,
            WorkplacePlan.date.in_(days)
        ))
    )
    return result.scalar_one_or_none() is not None


def is_on_leave_entire_week(session: Session, user_id: int, days: list) -> bool:
    """Check if user is on leave for all days in the week."""
    for day in days:
        if not is_user_on_leave(session, user_id, day):
            return False
    return True


@celery_app.task(name="app.tasks.notification_tasks.send_weekly_planning_reminders")
def send_weekly_planning_reminders():
    """
    Send reminders to employees who haven't planned their workplace for the week.
    Runs on Monday morning.
    """
    logger.info("Starting weekly planning reminder check")

    with Session(sync_engine) as session:
        # Get all active employees (including admins)
        result = session.execute(
            select(User).where(User.is_active == True)
        )
        employees = result.scalars().all()

        today = date.today()
        # Calculate week start (Monday)
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=4)  # Friday

        # Get working days for this week
        working_days = get_week_working_days(session, week_start)

        if not working_days:
            logger.info("No working days this week, skipping reminders")
            return {"status": "skipped", "reason": "no_working_days"}

        logger.info(f"Checking {len(employees)} employees for week {week_start} to {week_end}")

        sent_count = 0
        for employee in employees:
            try:
                # Skip if on leave entire week
                if is_on_leave_entire_week(session, employee.id, working_days):
                    logger.info(f"Skipping employee {employee.id} - on leave entire week")
                    continue

                # Check if has any workplace plan
                if has_any_workplace_plan(session, employee.id, working_days):
                    logger.info(f"Employee {employee.id} already has plans")
                    continue

                # Get profile for name and work email
                profile_result = session.execute(
                    select(EmployeeProfile).where(EmployeeProfile.user_id == employee.id)
                )
                profile = profile_result.scalar_one_or_none()

                if profile:
                    if profile.employment_start_date and week_end < profile.employment_start_date:
                        logger.info(f"Skipping employee {employee.id} - employment has not started")
                        continue
                    if profile.employment_end_date and week_start >= profile.employment_end_date:
                        logger.info(f"Skipping employee {employee.id} - employment inactive for this week")
                        continue

                    # Check user email preference
                    if not is_email_enabled_for_user_sync(session, employee.id, "email_weekly_reminder"):
                        logger.info(f"Skipping email for employee {employee.id} - disabled in settings")
                        continue

                    # Prefer work email, fallback to main email
                    email_to_use = profile.work_email if profile.work_email else employee.email

                    send_weekly_planning_email.delay(
                        email_to_use,
                        profile.full_name,
                        week_start.strftime("%d.%m.%Y"),
                        week_end.strftime("%d.%m.%Y")
                    )
                    sent_count += 1
                    logger.info(f"Scheduled reminder for employee {employee.id} ({email_to_use})")

            except Exception as e:
                logger.error(f"Error processing employee {employee.id}: {str(e)}")
                continue

    logger.info(f"Weekly planning reminders completed. Sent: {sent_count}")
    return {"status": "completed", "sent_count": sent_count}


def has_birthday_notification_today(session: Session, admin_id: int, related_user_id: int) -> bool:
    """Check if admin already has a birthday notification for this user today."""
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today + timedelta(days=1), datetime.min.time())

    result = session.execute(
        select(Notification).where(and_(
            Notification.user_id == admin_id,
            Notification.type == NotificationType.BIRTHDAY,
            Notification.related_user_id == related_user_id,
            Notification.created_at >= today_start,
            Notification.created_at < today_end
        ))
    )
    return result.scalar_one_or_none() is not None


@celery_app.task(name="app.tasks.notification_tasks.check_birthday_notifications")
def check_birthday_notifications():
    """
    Check for upcoming birthdays and create notifications for admins.
    Creates notifications on the birthday and 2 days before.
    """
    logger.info("Starting birthday notifications check")

    with Session(sync_engine) as session:
        today = date.today()
        in_two_days = today + timedelta(days=2)

        # Get all admin user IDs
        result = session.execute(
            select(User.id).where(User.is_active == True, User.role == UserRole.ADMIN)
        )
        admin_ids = [row[0] for row in result.fetchall()]

        if not admin_ids:
            logger.info("No admins found, skipping")
            return {"status": "skipped", "reason": "no_admins"}

        # Get all active employees with birthdays
        result = session.execute(
            select(EmployeeProfile, User).join(User).where(
                User.is_active == True,
                EmployeeProfile.birthday.isnot(None),
                or_(
                    EmployeeProfile.employment_end_date.is_(None),
                    EmployeeProfile.employment_end_date > today,
                )
            )
        )

        count = 0
        for profile, user in result.fetchall():
            if profile.birthday is None:
                continue

            try:
                birthday_this_year = profile.birthday.replace(year=today.year)
            except ValueError:
                # Feb 29 in non-leap year
                continue

            is_today = (birthday_this_year.month == today.month and
                       birthday_this_year.day == today.day)
            is_in_two_days = (birthday_this_year.month == in_two_days.month and
                            birthday_this_year.day == in_two_days.day)

            if is_today:
                title = "notification.birthday.todayTitle"
                message = f'{{"name": "{profile.full_name}"}}'
            elif is_in_two_days:
                title = "notification.birthday.upcomingTitle"
                message = f'{{"name": "{profile.full_name}", "date": "{birthday_this_year.strftime("%d.%m")}"}}'
            else:
                continue

            for admin_id in admin_ids:
                if not has_birthday_notification_today(session, admin_id, user.id):
                    notification = Notification(
                        user_id=admin_id,
                        type=NotificationType.BIRTHDAY,
                        title=title,
                        message=message,
                        related_user_id=user.id,
                    )
                    session.add(notification)
                    count += 1

        session.commit()

    logger.info(f"Birthday notifications check completed. Created: {count}")
    return {"status": "completed", "notifications_created": count}


@celery_app.task(name="app.tasks.notification_tasks.send_weekly_planning_email")
def send_weekly_planning_email(email: str, employee_name: str, week_start: str, week_end: str):
    """Send weekly planning reminder email."""
    import asyncio

    logger.info(f"Sending weekly planning reminder to {email}")

    email_service = EmailService()

    # Run async function in sync context
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            email_service.send_weekly_planning_reminder(email, employee_name, week_start, week_end)
        )
        if result:
            logger.info(f"Weekly planning reminder sent successfully to {email}")
        else:
            logger.warning(f"Failed to send weekly planning reminder to {email}")
    finally:
        loop.close()

    return {"status": "sent" if result else "failed", "email": email}
