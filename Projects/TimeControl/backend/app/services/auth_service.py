from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import Token
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from .user_service import UserService


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_service = UserService(db)

    async def authenticate(self, email: str, password: str) -> Optional[User]:
        """Authenticate user by email and password."""
        user = await self.user_service.get_by_email(email)
        if not user:
            return None
        if not verify_password(password, user.password_hash):
            return None
        if not user.is_active:
            return None
        return user

    async def login(self, email: str, password: str) -> Optional[Tuple[User, Token]]:
        """Login user and return tokens."""
        user = await self.authenticate(email, password)
        if not user:
            return None

        access_token = create_access_token(
            subject=user.id,
            additional_claims={"role": user.role.value}
        )
        refresh_token = create_refresh_token(subject=user.id)

        token = Token(
            access_token=access_token,
            refresh_token=refresh_token,
        )
        return user, token

    async def refresh_tokens(self, refresh_token: str) -> Optional[Token]:
        """Refresh access token using refresh token."""
        payload = decode_token(refresh_token)
        if not payload:
            return None
        if payload.get("type") != "refresh":
            return None

        user_id = int(payload.get("sub"))
        user = await self.user_service.get_by_id(user_id)
        if not user or not user.is_active:
            return None

        access_token = create_access_token(
            subject=user.id,
            additional_claims={"role": user.role.value}
        )
        new_refresh_token = create_refresh_token(subject=user.id)

        return Token(
            access_token=access_token,
            refresh_token=new_refresh_token,
        )

    async def get_current_user(self, token: str) -> Optional[User]:
        """Get current user from token."""
        payload = decode_token(token)
        if not payload:
            return None
        if payload.get("type") != "access":
            return None

        user_id = int(payload.get("sub"))
        user = await self.user_service.get_by_id(user_id)
        if not user or not user.is_active:
            return None
        return user
