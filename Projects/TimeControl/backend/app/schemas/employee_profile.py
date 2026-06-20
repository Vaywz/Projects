from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, Field
from app.models.time_entry import WorkplaceType
from app.models.user import UserRole


class EmployeeProfileBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    bank_account: Optional[str] = Field(None, max_length=50)
    position: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    default_workplace: Optional[WorkplaceType] = WorkplaceType.OFFICE
    work_email: Optional[str] = Field(None, max_length=255)
    employment_type: Optional[str] = 'full_time'
    payment_type: Optional[str] = 'salary'
    birthday: Optional[date] = None
    name_day: Optional[date] = None
    contract_number: Optional[str] = Field(None, max_length=50)
    employment_start_date: Optional[date] = None
    employment_end_date: Optional[date] = None
    employment_end_reason: Optional[str] = Field(None, max_length=500)
    emergency_contact_name: Optional[str] = Field(None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(None, max_length=50)
    declared_address: Optional[str] = Field(None, max_length=500)
    actual_address: Optional[str] = Field(None, max_length=500)
    personal_code: Optional[str] = Field(None, max_length=20)


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
    employment_type: Optional[str] = None
    payment_type: Optional[str] = None
    birthday: Optional[date] = None
    name_day: Optional[date] = None
    contract_number: Optional[str] = Field(None, max_length=50)
    employment_start_date: Optional[date] = None
    employment_end_date: Optional[date] = None
    employment_end_reason: Optional[str] = Field(None, max_length=500)
    emergency_contact_name: Optional[str] = Field(None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(None, max_length=50)
    declared_address: Optional[str] = Field(None, max_length=500)
    actual_address: Optional[str] = Field(None, max_length=500)
    personal_code: Optional[str] = Field(None, max_length=20)


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
    employment_type: Optional[str]
    payment_type: Optional[str]
    birthday: Optional[date]
    name_day: Optional[date]
    contract_number: Optional[str]
    employment_start_date: Optional[date]
    employment_end_date: Optional[date]
    employment_end_reason: Optional[str]
    emergency_contact_name: Optional[str]
    emergency_contact_phone: Optional[str]
    declared_address: Optional[str]
    actual_address: Optional[str]
    personal_code: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmployeeFullResponse(BaseModel):
    id: int
    email: str
    role: UserRole
    is_active: bool
    is_employee: bool
    created_at: datetime
    profile: Optional[EmployeeProfileResponse]

    class Config:
        from_attributes = True
