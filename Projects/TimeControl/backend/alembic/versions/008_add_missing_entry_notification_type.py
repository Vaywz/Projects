"""Add missing_entry notification type

Revision ID: 008
Revises: 007
Create Date: 2026-01-26
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    # Add new enum value to notificationtype
    op.execute("""
        ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'missing_entry';
    """)


def downgrade():
    # Note: PostgreSQL doesn't support removing enum values, would need to recreate the type
    pass