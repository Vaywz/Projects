from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.models.department import Department
from .deps import DbSession, CurrentUser, CurrentAdmin

router = APIRouter()


class DepartmentResponse(BaseModel):
    id: int
    name: str
    is_default: bool

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str


@router.get("", response_model=List[DepartmentResponse])
async def get_departments(
    current_user: CurrentUser = None,
    db: DbSession = None
):
    """Get all departments."""
    result = await db.execute(select(Department).order_by(Department.name))
    departments = result.scalars().all()
    return departments


@router.post("", response_model=DepartmentResponse)
async def create_department(
    department_data: DepartmentCreate,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Create a new department (admin only)."""
    # Check if department already exists
    result = await db.execute(
        select(Department).where(Department.name == department_data.name)
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department with this name already exists"
        )

    department = Department(
        name=department_data.name,
        is_default=False
    )
    db.add(department)
    await db.flush()
    await db.refresh(department)
    return department


@router.delete("/{department_id}")
async def delete_department(
    department_id: int,
    current_admin: CurrentAdmin = None,
    db: DbSession = None
):
    """Delete a department (admin only). Cannot delete default departments."""
    result = await db.execute(
        select(Department).where(Department.id == department_id)
    )
    department = result.scalar_one_or_none()
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )

    if department.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete default department"
        )

    await db.delete(department)
    return {"message": "Department deleted"}