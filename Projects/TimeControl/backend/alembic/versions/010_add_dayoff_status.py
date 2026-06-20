"""Add dayoff status type for part-time employees

Revision ID: 010
Revises: 009
Create Date: 2026-02-04

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum value for dayoff (brīvdiena) status
    op.execute("ALTER TYPE statustype ADD VALUE IF NOT EXISTS 'dayoff'")


def downgrade() -> None:
    # Cannot remove enum values in PostgreSQL easily
    # Would need to recreate the enum
    pass
