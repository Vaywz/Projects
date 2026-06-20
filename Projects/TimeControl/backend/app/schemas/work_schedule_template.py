from datetime import datetime
from typing import Dict, Any
from pydantic import BaseModel, Field


class WorkScheduleTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    schedule: Dict[str, Any]


class WorkScheduleTemplateCreate(WorkScheduleTemplateBase):
    pass


class WorkScheduleTemplateUpdate(BaseModel):
    name: str | None = None
    schedule: Dict[str, Any] | None = None


class WorkScheduleTemplateResponse(WorkScheduleTemplateBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}