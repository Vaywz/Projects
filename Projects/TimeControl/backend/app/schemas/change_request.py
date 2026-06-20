import datetime as dt
from typing import Optional
from pydantic import BaseModel

from app.models.change_request import ChangeRequestStatus, ChangeRequestType


class ChangeRequestCreate(BaseModel):
    request_type: ChangeRequestType
    time_entry_id: Optional[int] = None
    vacation_id: Optional[int] = None
    day_status_id: Optional[int] = None
    date: dt.date
    date_to: Optional[dt.date] = None  # End date for vacation/sick day ranges
    start_time: Optional[dt.time] = None
    end_time: Optional[dt.time] = None
    break_minutes: Optional[int] = None
    workplace: Optional[str] = None
    comment: Optional[str] = None
    reason: str


class ChangeRequestResolve(BaseModel):
    status: ChangeRequestStatus
    admin_comment: Optional[str] = None
    # Admin corrections (optional overrides)
    start_time: Optional[dt.time] = None
    end_time: Optional[dt.time] = None
    break_minutes: Optional[int] = None
    date: Optional[dt.date] = None
    date_to: Optional[dt.date] = None
    workplace: Optional[str] = None
    comment: Optional[str] = None


class ChangeRequestResponse(BaseModel):
    id: int
    user_id: int
    request_type: ChangeRequestType
    time_entry_id: Optional[int]
    vacation_id: Optional[int] = None
    day_status_id: Optional[int] = None
    date: dt.date
    date_to: Optional[dt.date] = None
    start_time: Optional[dt.time]
    end_time: Optional[dt.time]
    break_minutes: Optional[int]
    workplace: Optional[str]
    comment: Optional[str]
    reason: str
    status: ChangeRequestStatus
    admin_id: Optional[int]
    admin_comment: Optional[str]
    resolved_at: Optional[dt.datetime]
    created_at: dt.datetime
    updated_at: dt.datetime

    # Employee info
    employee_name: Optional[str] = None
    employee_email: Optional[str] = None

    # Hours info for admin review
    monthly_hours: Optional[float] = None
    monthly_limit: Optional[int] = None
    weekly_hours: Optional[float] = None

    class Config:
        from_attributes = True


class ChangeRequestListResponse(BaseModel):
    requests: list[ChangeRequestResponse]
    total: int
    pending_count: int