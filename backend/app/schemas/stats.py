from datetime import date
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum


class PeriodType(str, Enum):
    WEEK = "week"
    MONTH = "month"
    YEAR = "year"
    CUSTOM = "custom"


class StatsRequest(BaseModel):
    period: PeriodType = PeriodType.MONTH
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    user_id: Optional[int] = None


class DailyStats(BaseModel):
    date: date
    total_minutes: int
    total_hours: float
    break_minutes: int
    office_minutes: int
    remote_minutes: int
    status: Optional[str]  # NORMAL, SICK, VACATION
    is_working_day: bool


class WeeklyStats(BaseModel):
    week_number: int
    year: int
    start_date: date
    end_date: date
    total_minutes: int
    total_hours: float
    working_days: int
    days_with_entries: int
    office_days: int
    remote_days: int


class MonthlyStats(BaseModel):
    month: int
    year: int
    total_minutes: int
    total_hours: float
    working_days: int
    days_with_entries: int
    sick_days: int
    vacation_days: int
    office_days: int
    remote_days: int


class StatsResponse(BaseModel):
    period: PeriodType
    date_from: date
    date_to: date
    total_minutes: int
    total_hours: float
    total_break_minutes: int
    working_days: int
    days_with_entries: int
    sick_days: int
    vacation_days: int
    office_days: int
    remote_days: int
    daily_stats: List[DailyStats]
    weekly_stats: Optional[List[WeeklyStats]] = None
    monthly_stats: Optional[List[MonthlyStats]] = None
