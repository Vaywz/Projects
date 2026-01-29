from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.schemas.user import LoginRequest, Token, UserResponse
from app.schemas.employee_profile import EmployeeFullResponse
from app.schemas.company_setting import CompanySettingsResponse
from app.services.auth_service import AuthService
from app.services.company_settings_service import CompanySettingsService
from .deps import DbSession, CurrentUser

router = APIRouter()


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=dict)
async def login(login_data: LoginRequest, db: DbSession):
    """Login and get access tokens."""
    auth_service = AuthService(db)
    result = await auth_service.login(login_data.email, login_data.password)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    user, token = result
    return {
        "access_token": token.access_token,
        "refresh_token": token.refresh_token,
        "token_type": token.token_type,
        "user": EmployeeFullResponse.model_validate(user)
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(refresh_data: RefreshRequest, db: DbSession):
    """Refresh access token."""
    auth_service = AuthService(db)
    token = await auth_service.refresh_tokens(refresh_data.refresh_token)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    return token


@router.get("/me", response_model=EmployeeFullResponse)
async def get_current_user_info(current_user: CurrentUser):
    """Get current user information."""
    return EmployeeFullResponse.model_validate(current_user)


@router.post("/logout")
async def logout(current_user: CurrentUser):
    """Logout current user."""
    # In a stateless JWT setup, logout is handled client-side
    # For enhanced security, implement token blacklisting with Redis
    return {"message": "Successfully logged out"}


@router.get("/settings", response_model=CompanySettingsResponse)
async def get_public_settings(db: DbSession):
    """Get public company settings (logo, icons) - no auth required."""
    service = CompanySettingsService(db)
    return await service.get_all_settings()
