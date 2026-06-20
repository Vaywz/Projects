"""Add overtime_warning notification type

Revision ID: 011
Revises: 010
Create Date: 2026-02-05
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade():
    # Add overtime_warning to notificationtype enum
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'overtime_warning'")


def downgrade():
    # Note: PostgreSQL doesn't support removing enum values directly
    # Would need to recreate the type
    pass