from datetime import date
from typing import List
from fastapi import APIRouter, HTTPException, status, Query

from app.schemas.vacation import VacationCreate, VacationUpdate, VacationResponse
from app.services.vacation_service import VacationService
from app.models.user import UserRole
from .deps import DbSession, CurrentUser

router = APIRouter()


@router.get("", response_model=List[VacationResponse])
async def get_vacations(
    year: int = Query(None),
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get vacations for current user."""
    vacation_service = VacationService(db)

    if year:
        vacations = await vacation_service.get_user_vacations_for_year(
            current_user.id, year
        )
    else:
        vacations = await vacation_service.get_user_vacations(current_user.id)

    return [VacationResponse.model_validate(v) for v in vacations]


@router.get("/current", response_model=VacationResponse)
async def get_current_vacation(
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get current active vacation if any."""
    vacation_service = VacationService(db)
    vacation = await vacation_service.get_current_vacation(current_user.id)

    if not vacation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active vacation"
        )

    return VacationResponse.model_validate(vacation)


@router.post("", response_model=VacationResponse, status_code=status.HTTP_201_CREATED)
async def create_vacation(
    vacation_data: VacationCreate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Create a new vacation."""
    vacation_service = VacationService(db)

    try:
        vacation = await vacation_service.create(current_user.id, vacation_data)
        return VacationResponse.model_validate(vacation)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{vacation_id}", response_model=VacationResponse)
async def get_vacation(
    vacation_id: int,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get a specific vacation."""
    vacation_service = VacationService(db)
    vacation = await vacation_service.get_by_id(vacation_id)

    if not vacation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vacation not found"
        )

    if vacation.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this vacation"
        )

    return VacationResponse.model_validate(vacation)


@router.put("/{vacation_id}", response_model=VacationResponse)
async def update_vacation(
    vacation_id: int,
    vacation_data: VacationUpdate,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Update a vacation.

    Users can only modify dates that haven't passed yet:
    - If vacation hasn't started: can change both start and end dates
    - If vacation is ongoing: can only change end date (extend or shorten future days)
    - If vacation has ended: cannot modify
    """
    vacation_service = VacationService(db)
    vacation = await vacation_service.get_by_id(vacation_id)

    if not vacation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vacation not found"
        )

    # Allow admin to bypass restrictions
    is_admin = current_user.role == UserRole.ADMIN

    if vacation.user_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this vacation"
        )

    today = date.today()

    # Non-admin restrictions
    if not is_admin:
        # If vacation has completely ended, cannot modify
        if vacation.date_to < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify a vacation that has already ended"
            )

        # If vacation has started (date_from is in the past), cannot change date_from
        if vacation.date_from < today and vacation_data.date_from is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change start date of an ongoing vacation"
            )

        # If trying to set date_from, it must be >= today
        if vacation_data.date_from is not None and vacation_data.date_from < today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start date cannot be in the past"
            )

        # If vacation is ongoing, date_to must be >= today
        if vacation.date_from <= today and vacation_data.date_to is not None:
            if vacation_data.date_to < today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date cannot be in the past for an ongoing vacation"
                )

    try:
        updated = await vacation_service.update(vacation_id, vacation_data)
        return VacationResponse.model_validate(updated)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{vacation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vacation(
    vacation_id: int,
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Delete a vacation.

    Users can only delete vacations that haven't started yet.
    Admins can delete any vacation.
    """
    vacation_service = VacationService(db)
    vacation = await vacation_service.get_by_id(vacation_id)

    if not vacation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vacation not found"
        )

    # Allow admin to bypass restrictions
    is_admin = current_user.role == UserRole.ADMIN

    if vacation.user_id != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this vacation"
        )

    today = date.today()

    # Non-admin: can only delete future vacations
    if not is_admin:
        if vacation.date_from <= today:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete a vacation that has already started. You can only edit it."
            )

    await vacation_service.delete(vacation_id)
