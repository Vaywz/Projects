from datetime import date
from fastapi import APIRouter, Query

from app.schemas.stats import PeriodType, StatsResponse
from app.services.stats_service import StatsService
from .deps import DbSession, CurrentUser

router = APIRouter()


@router.get("/me", response_model=StatsResponse)
async def get_my_stats(
    period: PeriodType = Query(PeriodType.MONTH),
    date_from: date = Query(None),
    date_to: date = Query(None),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get statistics for current user."""
    stats_service = StatsService(db)
    return await stats_service.get_stats(
        user_id=current_user.id,
        period=period,
        date_from=date_from,
        date_to=date_to
    )
