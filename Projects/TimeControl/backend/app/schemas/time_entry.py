from datetime import date, time, datetime
from typing import Optional, List, Union, Annotated
from pydantic import BaseModel, Field, field_validator, model_validator, BeforeValidator
from app.models.time_entry import WorkplaceType


def parse_date(value: Union[str, date, None]) -> Optional[date]:
    """Parse date from string or date object."""
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        # Try parsing YYYY-MM-DD format
        try:
            parts = value.split('-')
            if len(parts) == 3:
                year = int(parts[0])
                month = int(parts[1])
                day = int(parts[2])
                return date(year, month, day)
        except (ValueError, IndexError):
            pass
        raise ValueError(f'Invalid date format: {value}')
    raise ValueError(f'Invalid date format: {value}')


def parse_time(value: Union[str, time, None]) -> Optional[time]:
    """Parse time from string or time object."""
    if value is None:
        return None
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        # Try parsing HH:MM:SS or HH:MM format
        try:
            parts = value.split(':')
            if len(parts) >= 2:
                hour = int(parts[0])
                minute = int(parts[1])
                second = int(parts[2]) if len(parts) > 2 else 0
                return time(hour, minute, second)
        except (ValueError, IndexError):
            pass
        raise ValueError(f'Invalid time format: {value}')
    raise ValueError(f'Invalid time format: {value}')


# Annotated types for automatic parsing
ParsedDate = Annotated[date, BeforeValidator(parse_date)]
ParsedTime = Annotated[time, BeforeValidator(parse_time)]
OptionalParsedDate = Annotated[Optional[date], BeforeValidator(parse_date)]
OptionalParsedTime = Annotated[Optional[time], BeforeValidator(parse_time)]


class TimeEntryBase(BaseModel):
    date: ParsedDate
    start_time: ParsedTime
    end_time: ParsedTime
    break_minutes: int = Field(default=0, ge=0, le=480)
    workplace: WorkplaceType = WorkplaceType.OFFICE
    comment: Optional[str] = Field(None, max_length=500)

    @field_validator('end_time')
    @classmethod
    def end_time_must_be_after_start_time(cls, v, info):
        if 'start_time' in info.data and v <= info.data['start_time']:
            raise ValueError('end_time must be after start_time')
        return v

    @model_validator(mode='after')
    def validate_max_work_duration(self):
        total_minutes = (self.end_time.hour * 60 + self.end_time.minute) - (self.start_time.hour * 60 + self.start_time.minute)
        work_minutes = total_minutes - self.break_minutes
        if work_minutes > 480:  # 8 hours max
            raise ValueError('Maximum work time is 8 hours')
        return self


class TimeEntryCreate(TimeEntryBase):
    pass


class TimeEntryCreateAdmin(BaseModel):
    """Admin-only schema without 8-hour work limit."""
    date: ParsedDate
    start_time: ParsedTime
    end_time: ParsedTime
    break_minutes: int = Field(default=0, ge=0, le=480)
    workplace: WorkplaceType = WorkplaceType.OFFICE
    comment: Optional[str] = Field(None, max_length=500)

    @field_validator('end_time')
    @classmethod
    def end_time_must_be_after_start_time(cls, v, info):
        if 'start_time' in info.data and v <= info.data['start_time']:
            raise ValueError('end_time must be after start_time')
        return v


class TimeEntryUpdate(BaseModel):
    date: OptionalParsedDate = None
    start_time: OptionalParsedTime = None
    end_time: OptionalParsedTime = None
    break_minutes: Optional[int] = Field(None, ge=0, le=480)
    workplace: Optional[WorkplaceType] = None
    comment: Optional[str] = Field(None, max_length=500)


class TimeEntryUpdateAdmin(BaseModel):
    """Admin-only schema without restrictions."""
    date: OptionalParsedDate = None
    start_time: OptionalParsedTime = None
    end_time: OptionalParsedTime = None
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
