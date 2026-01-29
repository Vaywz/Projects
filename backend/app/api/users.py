from fastapi import APIRouter, HTTPException, status

from app.schemas.user import UserUpdate
from app.schemas.employee_profile import EmployeeProfileUpdate, EmployeeProfileResponse
from app.services.user_service import UserService
from .deps import DbSession, CurrentUser

router = APIRouter()


@router.get("/profile", response_model=EmployeeProfileResponse)
async def get_my_profile(current_user: CurrentUser):
    """Get current user's profile."""
    if not current_user.profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )
    return EmployeeProfileResponse.model_validate(current_user.profile)


@router.put("/profile", response_model=EmployeeProfileResponse)
async def update_my_profile(
    profile_data: EmployeeProfileUpdate,
    current_user: CurrentUser,
    db: DbSession
):
    """Update current user's profile."""
    user_service = UserService(db)
    profile = await user_service.update_profile(current_user.id, profile_data)

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found"
        )

    return EmployeeProfileResponse.model_validate(profile)


@router.put("/password")
async def change_password(
    password_data: dict,
    current_user: CurrentUser,
    db: DbSession
):
    """Change current user's password."""
    from app.core.security import verify_password

    current_password = password_data.get("current_password")
    new_password = password_data.get("new_password")

    if not current_password or not new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both current_password and new_password are required"
        )

    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters"
        )

    if not verify_password(current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    user_service = UserService(db)
    await user_service.update(current_user.id, UserUpdate(password=new_password))

    return {"message": "Password changed successfully"}
