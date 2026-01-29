from datetime import date
from fastapi import APIRouter, Query

from app.schemas.calendar_day import CalendarDayResponse, CalendarMonthResponse
from app.services.calendar_service import CalendarService
from .deps import DbSession, CurrentUser

router = APIRouter()


@router.get("/month", response_model=CalendarMonthResponse)
async def get_calendar_month(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get calendar days for a month."""
    calendar_service = CalendarService(db)
    days = await calendar_service.get_month(year, month)

    return CalendarMonthResponse(
        year=year,
        month=month,
        days=[CalendarDayResponse.model_validate(d) for d in days]
    )


@router.get("/day", response_model=CalendarDayResponse)
async def get_calendar_day(
    date_param: date = Query(..., alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get calendar day info."""
    calendar_service = CalendarService(db)
    await calendar_service.ensure_days_exist(date_param, date_param)
    day = await calendar_service.get_day(date_param)

    return CalendarDayResponse.model_validate(day)


@router.get("/working-days")
async def get_working_days(
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get working days in a date range."""
    calendar_service = CalendarService(db)
    days = await calendar_service.get_working_days(date_from, date_to)

    return {
        "date_from": date_from,
        "date_to": date_to,
        "count": len(days),
        "dates": [d.date for d in days]
    }
