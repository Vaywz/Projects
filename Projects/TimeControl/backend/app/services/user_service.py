from typing import Optional, List
from datetime import date, timedelta
from sqlalchemy import select, and_, or_, extract
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

    async def get_all_employees(
        self,
        active_only: bool = True,
        employees_only: bool = False,
        archived: Optional[bool] = False,
        reference_date: Optional[date] = None,
    ) -> List[User]:
        """Get all employees."""
        query = select(User).options(selectinload(User.profile))
        if active_only:
            query = query.where(User.is_active == True)
        if employees_only:
            query = query.where(User.is_employee == True)
        if archived is not None:
            reference_date = reference_date or date.today()
            query = query.join(EmployeeProfile, User.id == EmployeeProfile.user_id)
            if archived:
                query = query.where(
                    EmployeeProfile.employment_end_date.isnot(None),
                    EmployeeProfile.employment_end_date <= reference_date,
                )
            else:
                query = query.where(or_(
                    EmployeeProfile.employment_end_date.is_(None),
                    EmployeeProfile.employment_end_date > reference_date,
                ))
        query = query.order_by(User.id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_active_employees(self, target_date: Optional[date] = None) -> List[User]:
        """Get active users marked as employees and visible on the target date."""
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.profile))
            .where(User.is_active == True, User.is_employee == True)
        )
        employees = list(result.scalars().all())
        if target_date is None:
            return employees

        visible_employees = []
        for employee in employees:
            profile = employee.profile
            if not profile:
                continue
            if profile.employment_start_date and target_date < profile.employment_start_date:
                continue
            if profile.employment_end_date and target_date >= profile.employment_end_date:
                continue
            visible_employees.append(employee)

        return visible_employees

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
            department=user_data.department,
            work_email=user_data.work_email,
            employment_type=user_data.employment_type,
            payment_type=user_data.payment_type,
            birthday=user_data.birthday,
            name_day=user_data.name_day,
            contract_number=user_data.contract_number,
            employment_start_date=user_data.employment_start_date,
            employment_end_date=user_data.employment_end_date,
            employment_end_reason=user_data.employment_end_reason,
            emergency_contact_name=user_data.emergency_contact_name,
            emergency_contact_phone=user_data.emergency_contact_phone,
            declared_address=user_data.declared_address,
            actual_address=user_data.actual_address,
            personal_code=user_data.personal_code,
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

    async def get_upcoming_birthdays(self, days_ahead: int = 2) -> List[dict]:
        """Get employees with upcoming birthdays (today and within days_ahead days)."""
        today = date.today()

        # Get all active employees with profiles
        employees = await self.get_all_employees(active_only=True, employees_only=True)

        upcoming = []
        for emp in employees:
            if emp.profile and emp.profile.birthday:
                birthday = emp.profile.birthday
                # Create this year's birthday
                try:
                    this_year_birthday = birthday.replace(year=today.year)
                except ValueError:
                    # Handle Feb 29 for non-leap years
                    this_year_birthday = birthday.replace(year=today.year, day=28)

                # Check if birthday is today or within days_ahead
                days_until = (this_year_birthday - today).days

                # Handle year boundary (e.g., today is Dec 30, birthday is Jan 2)
                if days_until < 0:
                    try:
                        next_year_birthday = birthday.replace(year=today.year + 1)
                    except ValueError:
                        next_year_birthday = birthday.replace(year=today.year + 1, day=28)
                    days_until = (next_year_birthday - today).days
                    this_year_birthday = next_year_birthday

                if 0 <= days_until <= days_ahead:
                    upcoming.append({
                        "user_id": emp.id,
                        "first_name": emp.profile.first_name,
                        "last_name": emp.profile.last_name,
                        "birthday": this_year_birthday.isoformat(),
                        "days_until": days_until,
                        "is_today": days_until == 0,
                    })

        # Sort by days_until
        upcoming.sort(key=lambda x: x["days_until"])
        return upcoming

    async def get_upcoming_name_days(self, days_ahead: int = 2) -> List[dict]:
        """Get employees with upcoming name days (today and within days_ahead days)."""
        today = date.today()

        employees = await self.get_all_employees(active_only=True, employees_only=True)

        upcoming = []
        for emp in employees:
            if emp.profile and emp.profile.name_day:
                name_day = emp.profile.name_day
                try:
                    this_year_name_day = name_day.replace(year=today.year)
                except ValueError:
                    this_year_name_day = name_day.replace(year=today.year, day=28)

                days_until = (this_year_name_day - today).days

                if days_until < 0:
                    try:
                        next_year_name_day = name_day.replace(year=today.year + 1)
                    except ValueError:
                        next_year_name_day = name_day.replace(year=today.year + 1, day=28)
                    days_until = (next_year_name_day - today).days
                    this_year_name_day = next_year_name_day

                if 0 <= days_until <= days_ahead:
                    upcoming.append({
                        "user_id": emp.id,
                        "first_name": emp.profile.first_name,
                        "last_name": emp.profile.last_name,
                        "name_day": this_year_name_day.isoformat(),
                        "days_until": days_until,
                        "is_today": days_until == 0,
                    })

        upcoming.sort(key=lambda x: x["days_until"])
        return upcoming
