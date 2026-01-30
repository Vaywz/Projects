from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field
from app.models.time_entry import WorkplaceType
from app.models.user import UserRole
from app.models.employee_profile import EmploymentType, PaymentType


class EmployeeProfileBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    bank_account: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    default_workplace: Optional[WorkplaceType] = WorkplaceType.OFFICE
    work_email: Optional[str] = Field(None, max_length=255)
    employment_type: Optional[EmploymentType] = EmploymentType.FULL_TIME
    payment_type: Optional[PaymentType] = PaymentType.SALARY
    birthday: Optional[date] = None
    name_day: Optional[date] = None
    contract_number: Optional[str] = Field(None, max_length=50)
    employment_start_date: Optional[date] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(None, max_length=50)
    declared_address: Optional[str] = Field(None, max_length=500)


class EmployeeProfileCreate(EmployeeProfileBase):
    pass


class EmployeeProfileUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    avatar_url: Optional[str] = None
    bank_account: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    default_workplace: Optional[WorkplaceType] = None
    work_email: Optional[str] = Field(None, max_length=255)
    employment_type: Optional[EmploymentType] = None
    payment_type: Optional[PaymentType] = None
    birthday: Optional[date] = None
    name_day: Optional[date] = None
    contract_number: Optional[str] = Field(None, max_length=50)
    employment_start_date: Optional[date] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(None, max_length=50)
    declared_address: Optional[str] = Field(None, max_length=500)


class EmployeeProfileResponse(BaseModel):
    id: int
    user_id: int
    first_name: str
    last_name: str
    phone: Optional[str]
    avatar_url: Optional[str]
    bank_account: Optional[str]
    position: Optional[str]
    department: Optional[str]
    default_workplace: Optional[WorkplaceType]
    work_email: Optional[str]
    employment_type: Optional[EmploymentType]
    payment_type: Optional[PaymentType]
    birthday: Optional[date]
    name_day: Optional[date]
    contract_number: Optional[str]
    employment_start_date: Optional[date]
    emergency_contact_name: Optional[str]
    emergency_contact_phone: Optional[str]
    declared_address: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmployeeFullResponse(BaseModel):
    id: int
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime
    profile: Optional[EmployeeProfileResponse]

    class Config:
        from_attributes = True
