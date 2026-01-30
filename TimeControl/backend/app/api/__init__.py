from fastapi import APIRouter
from .auth import router as auth_router
from .users import router as users_router
from .calendar import router as calendar_router
from .time_entries import router as time_entries_router
from .day_status import router as day_status_router
from .vacations import router as vacations_router
from .stats import router as stats_router
from .office import router as office_router
from .admin import router as admin_router
from .workplace_plan import router as workplace_plan_router
from .change_requests import router as change_requests_router
from .departments import router as departments_router
from .notifications import router as notifications_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(calendar_router, prefix="/calendar", tags=["calendar"])
api_router.include_router(time_entries_router, prefix="/time-entries", tags=["time-entries"])
api_router.include_router(day_status_router, prefix="/day-status", tags=["day-status"])
api_router.include_router(vacations_router, prefix="/vacations", tags=["vacations"])
api_router.include_router(stats_router, prefix="/stats", tags=["stats"])
api_router.include_router(office_router, prefix="/office", tags=["office"])
api_router.include_router(workplace_plan_router, prefix="/workplace-plans", tags=["workplace-plans"])
api_router.include_router(change_requests_router, prefix="/change-requests", tags=["change-requests"])
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
api_router.include_router(departments_router, prefix="/departments", tags=["departments"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
