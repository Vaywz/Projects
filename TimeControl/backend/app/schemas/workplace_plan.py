from datetime import date as date_type
from pydantic import BaseModel
from app.models.time_entry import WorkplaceType


class WorkplacePlanCreate(BaseModel):
    date: date_type
    workplace: WorkplaceType


class WorkplacePlanUpdate(BaseModel):
    workplace: WorkplaceType


class WorkplacePlanResponse(BaseModel):
    id: int
    user_id: int
    date: date_type
    workplace: WorkplaceType

    model_config = {"from_attributes": True}