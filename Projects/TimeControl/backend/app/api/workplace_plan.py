from datetime import date
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Query

from app.schemas.workplace_plan import WorkplacePlanCreate, WorkplacePlanResponse
from app.services.workplace_plan_service import WorkplacePlanService
from .deps import DbSession, CurrentUser

router = APIRouter()


@router.get("", response_model=List[WorkplacePlanResponse])
async def get_my_workplace_plans(
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get current user's workplace plans for a date range."""
    service = WorkplacePlanService(db)
    plans = await service.get_user_plans_for_range(current_user.id, date_from, date_to)
    return [WorkplacePlanResponse.model_validate(p) for p in plans]


@router.get("/date", response_model=Optional[WorkplacePlanResponse])
async def get_my_workplace_plan_for_date(
    date_param: date = Query(..., alias="date"),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get current user's workplace plan for a specific date."""
    service = WorkplacePlanService(db)
    plan = await service.get_user_plan_for_date(current_user.id, date_param)
    if not plan:
        return None
    return WorkplacePlanResponse.model_validate(plan)


@router.post("", response_model=WorkplacePlanResponse, status_code=status.HTTP_201_CREATED)
async def create_workplace_plan(
    plan_data: WorkplacePlanCreate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Create or update a workplace plan."""
    service = WorkplacePlanService(db)
    plan = await service.create(current_user.id, plan_data)
    return WorkplacePlanResponse.model_validate(plan)


@router.delete("/{date_param}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workplace_plan(
    date_param: date,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Delete a workplace plan for a specific date."""
    service = WorkplacePlanService(db)
    deleted = await service.delete_by_user_and_date(current_user.id, date_param)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workplace plan not found"
        )