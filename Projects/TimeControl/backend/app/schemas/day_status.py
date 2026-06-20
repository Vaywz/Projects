from datetime import date as DateType, datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.day_status import StatusType


class DayStatusBase(BaseModel):
    date: DateType
    status: StatusType
    note: Optional[str] = Field(None, max_length=500)


class DayStatusCreate(DayStatusBase):
    pass


class DayStatusUpdate(BaseModel):
    date: Optional[DateType] = None
    status: Optional[StatusType] = None
    note: Optional[str] = Field(None, max_length=500)

    model_config = {"extra": "ignore"}


class DayStatusResponse(BaseModel):
    id: int
    user_id: int
    date: DateType
    status: StatusType
    auto_skip_day: bool
    note: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
