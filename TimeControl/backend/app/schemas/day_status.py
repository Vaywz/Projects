from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.day_status import StatusType


class DayStatusBase(BaseModel):
    date: date
    status: StatusType
    note: Optional[str] = Field(None, max_length=500)


class DayStatusCreate(DayStatusBase):
    pass


class DayStatusUpdate(BaseModel):
    status: Optional[StatusType] = None
    note: Optional[str] = Field(None, max_length=500)


class DayStatusResponse(BaseModel):
    id: int
    user_id: int
    date: date
    status: StatusType
    auto_skip_day: bool
    note: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
