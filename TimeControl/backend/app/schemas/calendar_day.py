from datetime import date
from typing import Optional, List
from pydantic import BaseModel
from app.models.calendar_day import DayType


class CalendarDayResponse(BaseModel):
    id: int
    date: date
    day_type: DayType
    holiday_name: Optional[str]
    holiday_name_lv: Optional[str]
    holiday_name_en: Optional[str]
    country: str
    is_working_day: bool

    class Config:
        from_attributes = True


class CalendarMonthResponse(BaseModel):
    year: int
    month: int
    days: List[CalendarDayResponse]
