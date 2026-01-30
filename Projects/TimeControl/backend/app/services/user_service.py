from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User, UserRole
from app.models.employee_profile import EmployeeProfile
from app.schemas.user import UserCreate, UserUpdate
from app.schemas.employee_profile import EmployeeProfileUpdate
from app.core.security import get_password_hash


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.profile))
            .where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.profile))
            .where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_all_employees(self, active_only: bool = True) -> List[User]:
        """Get all employees."""
        query = select(User).options(selectinload(User.profile))
        if active_only:
            query = query.where(User.is_active == True)
        query = query.order_by(User.id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_active_employees(self) -> List[User]:
        """Get all active users (employees and admins)."""
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.profile))
            .where(User.is_active == True)
        )
        return list(result.scalars().all())

    async def create(self, user_data: UserCreate) -> User:
        """Create a new user with profile."""
        # Create user
        user = User(
            email=user_data.email,
            password_hash=get_password_hash(user_data.password),
            role=user_data.role,
            is_active=True,
        )
        self.db.add(user)
        await self.db.flush()

        # Create profile
        profile = EmployeeProfile(
            user_id=user.id,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            phone=user_data.phone,
            bank_account=user_data.bank_account,
            position=user_data.position,
            work_email=user_data.work_email,
            employment_type=user_data.employment_type,
            payment_type=user_data.payment_type,
            birthday=user_data.birthday,
        )
        self.db.add(profile)
        await self.db.commit()

        # Reload user with profile using eager loading
        return await self.get_by_id(user.id)

    async def update(self, user_id: int, user_data: UserUpdate) -> Optional[User]:
        """Update user."""
        user = await self.get_by_id(user_id)
        if not user:
            return None

        update_data = user_data.model_dump(exclude_unset=True)

        # Check if email is being updated and if it's already taken
        if 'email' in update_data and update_data['email'] != user.email:
            existing = await self.get_by_email(update_data['email'])
            if existing:
                raise ValueError("Email already registered")

        if 'password' in update_data:
            update_data['password_hash'] = get_password_hash(update_data.pop('password'))

        for field, value in update_data.items():
            setattr(user, field, value)

        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def update_profile(self, user_id: int, profile_data: EmployeeProfileUpdate) -> Optional[EmployeeProfile]:
        """Update employee profile."""
        user = await self.get_by_id(user_id)
        if not user or not user.profile:
            return None

        update_data = profile_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user.profile, field, value)

        await self.db.flush()
        await self.db.refresh(user.profile)
        return user.profile

    async def activate(self, user_id: int) -> Optional[User]:
        """Activate user."""
        user = await self.get_by_id(user_id)
        if not user:
            return None
        user.is_active = True
        await self.db.flush()
        return user

    async def deactivate(self, user_id: int) -> Optional[User]:
        """Deactivate user."""
        user = await self.get_by_id(user_id)
        if not user:
            return None
        user.is_active = False
        await self.db.flush()
        return user

    async def delete(self, user_id: int) -> bool:
        """Delete user."""
        user = await self.get_by_id(user_id)
        if not user:
            return False
        await self.db.delete(user)
        await self.db.flush()
        return True
