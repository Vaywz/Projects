"""Add unexcused and holiday status types

Revision ID: 009
Revises: 008
Create Date: 2026-02-03

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum values to statustype
    op.execute("ALTER TYPE statustype ADD VALUE IF NOT EXISTS 'unexcused'")
    op.execute("ALTER TYPE statustype ADD VALUE IF NOT EXISTS 'holiday'")


def downgrade() -> None:
    # Cannot remove enum values in PostgreSQL easily
    # Would need to recreate the enum
    pass
