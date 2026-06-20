"""Add employment end fields

Revision ID: 018
Revises: 017
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('employee_profiles', sa.Column('employment_end_date', sa.Date(), nullable=True))
    op.add_column('employee_profiles', sa.Column('employment_end_reason', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('employee_profiles', 'employment_end_reason')
    op.drop_column('employee_profiles', 'employment_end_date')
