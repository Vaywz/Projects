from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "hitexis_time",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.notification_tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Riga",  # Latvia timezone
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes
    worker_prefetch_multiplier=1,
)

# Scheduled tasks
celery_app.conf.beat_schedule = {
    "check-missing-entries-daily": {
        "task": "app.tasks.notification_tasks.check_missing_entries",
        "schedule": crontab(hour=9, minute=0),  # Run at 9:00 AM Latvia time daily
    },
    "send-weekly-planning-reminders-monday": {
        "task": "app.tasks.notification_tasks.send_weekly_planning_reminders",
        "schedule": crontab(hour=8, minute=0, day_of_week=1),  # Monday at 8:00 AM Latvia time
    },
    "send-weekly-planning-reminders-tuesday": {
        "task": "app.tasks.notification_tasks.send_weekly_planning_reminders",
        "schedule": crontab(hour=9, minute=0, day_of_week=2),  # Tuesday at 9:00 AM Latvia time (follow-up)
    },
}
