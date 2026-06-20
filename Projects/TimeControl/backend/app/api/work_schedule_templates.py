from typing import List
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.models.work_schedule_template import WorkScheduleTemplate
from app.schemas.work_schedule_template import (
    WorkScheduleTemplateCreate,
    WorkScheduleTemplateUpdate,
    WorkScheduleTemplateResponse,
)
from .deps import DbSession, CurrentUser

router = APIRouter()


@router.get("", response_model=List[WorkScheduleTemplateResponse])
async def list_my_templates(
    current_user: CurrentUser = None,
    db: DbSession = None,
):
    result = await db.execute(
        select(WorkScheduleTemplate)
        .where(WorkScheduleTemplate.user_id == current_user.id)
        .order_by(WorkScheduleTemplate.created_at.desc())
    )
    items = result.scalars().all()
    return [WorkScheduleTemplateResponse.model_validate(t) for t in items]


@router.post("", response_model=WorkScheduleTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: WorkScheduleTemplateCreate,
    current_user: CurrentUser = None,
    db: DbSession = None,
):
    template = WorkScheduleTemplate(
        user_id=current_user.id,
        name=data.name,
        schedule=data.schedule,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return WorkScheduleTemplateResponse.model_validate(template)


@router.put("/{template_id}", response_model=WorkScheduleTemplateResponse)
async def update_template(
    template_id: int,
    data: WorkScheduleTemplateUpdate,
    current_user: CurrentUser = None,
    db: DbSession = None,
):
    result = await db.execute(
        select(WorkScheduleTemplate).where(
            WorkScheduleTemplate.id == template_id,
            WorkScheduleTemplate.user_id == current_user.id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    if data.name is not None:
        template.name = data.name
    if data.schedule is not None:
        template.schedule = data.schedule

    await db.commit()
    await db.refresh(template)
    return WorkScheduleTemplateResponse.model_validate(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    current_user: CurrentUser = None,
    db: DbSession = None,
):
    result = await db.execute(
        select(WorkScheduleTemplate).where(
            WorkScheduleTemplate.id == template_id,
            WorkScheduleTemplate.user_id == current_user.id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    await db.delete(template)
    await db.commit()