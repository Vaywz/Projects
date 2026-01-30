from datetime import date, time, datetime
from typing import Optional
from pydantic import BaseModel

from app.models.change_request import ChangeRequestStatus, ChangeRequestType


class ChangeRequestCreate(BaseModel):
    request_type: ChangeRequestType
    time_entry_id: Optional[int] = None
    vacation_id: Optional[int] = None
    day_status_id: Optional[int] = None
    date: date
    date_to: Optional[date] = None  # End date for vacation/sick day ranges
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_minutes: Optional[int] = None
    workplace: Optional[str] = None
    comment: Optional[str] = None
    reason: str


class ChangeRequestResolve(BaseModel):
    status: ChangeRequestStatus
    admin_comment: Optional[str] = None


class ChangeRequestResponse(BaseModel):
    id: int
    user_id: int
    request_type: ChangeRequestType
    time_entry_id: Optional[int]
    vacation_id: Optional[int] = None
    day_status_id: Optional[int] = None
    date: date
    date_to: Optional[date] = None
    start_time: Optional[time]
    end_time: Optional[time]
    break_minutes: Optional[int]
    workplace: Optional[str]
    comment: Optional[str]
    reason: str
    status: ChangeRequestStatus
    admin_id: Optional[int]
    admin_comment: Optional[str]
    resolved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    # Employee info
    employee_name: Optional[str] = None
    employee_email: Optional[str] = None

    class Config:
        from_attributes = True


class ChangeRequestListResponse(BaseModel):
    requests: list[ChangeRequestResponse]
    total: int
    pending_count: int