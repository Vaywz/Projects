"""Add personal_code field to employee_profiles

Revision ID: 012
Revises: 011
Create Date: 2026-02-12
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('employee_profiles', sa.Column('personal_code', sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('employee_profiles', 'personal_code')
