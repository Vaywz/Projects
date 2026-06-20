from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole


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
    department: Optional[str] = None
    work_email: Optional[str] = None
    employment_type: Optional[str] = 'full_time'
    payment_type: Optional[str] = 'salary'
    birthday: Optional[date] = None
    name_day: Optional[date] = None
    contract_number: Optional[str] = None
    employment_start_date: Optional[date] = None
    employment_end_date: Optional[date] = None
    employment_end_reason: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    declared_address: Optional[str] = None
    actual_address: Optional[str] = None
    personal_code: Optional[str] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6)
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None
    is_employee: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    email: str
    role: UserRole
    is_active: bool
    is_employee: bool
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
