"""Add vacation and sick day change request support

Revision ID: 007
Revises: 006
Create Date: 2024-01-26
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    # Add new enum values to changerequesttype
    op.execute("""
        ALTER TYPE changerequesttype ADD VALUE IF NOT EXISTS 'add_vacation';
    """)
    op.execute("""
        ALTER TYPE changerequesttype ADD VALUE IF NOT EXISTS 'edit_vacation';
    """)
    op.execute("""
        ALTER TYPE changerequesttype ADD VALUE IF NOT EXISTS 'delete_vacation';
    """)
    op.execute("""
        ALTER TYPE changerequesttype ADD VALUE IF NOT EXISTS 'add_sick_day';
    """)
    op.execute("""
        ALTER TYPE changerequesttype ADD VALUE IF NOT EXISTS 'edit_sick_day';
    """)
    op.execute("""
        ALTER TYPE changerequesttype ADD VALUE IF NOT EXISTS 'delete_sick_day';
    """)

    # Add new columns to change_requests table
    op.execute("""
        ALTER TABLE change_requests
        ADD COLUMN IF NOT EXISTS vacation_id INTEGER REFERENCES vacations(id) ON DELETE SET NULL;
    """)
    op.execute("""
        ALTER TABLE change_requests
        ADD COLUMN IF NOT EXISTS day_status_id INTEGER REFERENCES day_statuses(id) ON DELETE SET NULL;
    """)
    op.execute("""
        ALTER TABLE change_requests
        ADD COLUMN IF NOT EXISTS date_to DATE;
    """)


def downgrade():
    # Remove columns
    op.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS date_to;")
    op.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS day_status_id;")
    op.execute("ALTER TABLE change_requests DROP COLUMN IF EXISTS vacation_id;")
    # Note: PostgreSQL doesn't support removing enum values, would need to recreate the type