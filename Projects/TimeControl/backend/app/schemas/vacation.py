from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from app.models.vacation import VacationStatus


class VacationBase(BaseModel):
    date_from: date
    date_to: date
    note: Optional[str] = Field(None, max_length=500)

    @field_validator('date_to')
    @classmethod
    def date_to_must_be_after_date_from(cls, v, info):
        if 'date_from' in info.data and v < info.data['date_from']:
            raise ValueError('date_to must be on or after date_from')
        return v


class VacationCreate(VacationBase):
    pass


class VacationUpdate(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    status: Optional[VacationStatus] = None
    note: Optional[str] = Field(None, max_length=500)


class VacationResponse(BaseModel):
    id: int
    user_id: int
    date_from: date
    date_to: date
    status: VacationStatus
    note: Optional[str]
    days_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
