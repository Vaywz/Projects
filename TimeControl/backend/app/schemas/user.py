from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole
from app.models.employee_profile import EmploymentType, PaymentType


class UserBase(BaseModel):
    email: EmailStr
    role: UserRole = UserRole.EMPLOYEE


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = None
    bank_account: Optional[str] = None
    position: Optional[str] = None
    work_email: Optional[str] = None
    employment_type: Optional[EmploymentType] = EmploymentType.FULL_TIME
    payment_type: Optional[PaymentType] = PaymentType.SALARY
    birthday: Optional[date] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6)
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None


class UserResponse(BaseModel):
    id: int
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserInDB(UserResponse):
    password_hash: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    exp: datetime
    type: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
