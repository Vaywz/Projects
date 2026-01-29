from datetime import date, time, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from app.models.time_entry import WorkplaceType


class TimeEntryBase(BaseModel):
    date: date
    start_time: time
    end_time: time
    break_minutes: int = Field(default=0, ge=0, le=480)
    workplace: WorkplaceType = WorkplaceType.OFFICE
    comment: Optional[str] = Field(None, max_length=500)

    @field_validator('end_time')
    @classmethod
    def end_time_must_be_after_start_time(cls, v, info):
        if 'start_time' in info.data and v <= info.data['start_time']:
            raise ValueError('end_time must be after start_time')
        return v


class TimeEntryCreate(TimeEntryBase):
    pass


class TimeEntryUpdate(BaseModel):
    date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_minutes: Optional[int] = Field(None, ge=0, le=480)
    workplace: Optional[WorkplaceType] = None
    comment: Optional[str] = Field(None, max_length=500)


class TimeEntryResponse(BaseModel):
    id: int
    user_id: int
    date: date
    start_time: time
    end_time: time
    break_minutes: int
    workplace: WorkplaceType
    comment: Optional[str]
    duration_minutes: int
    duration_hours: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DaySummary(BaseModel):
    date: date
    entries: List[TimeEntryResponse]
    total_minutes: int
    total_hours: float
    total_break_minutes: int
    has_office: bool
    has_remote: bool
