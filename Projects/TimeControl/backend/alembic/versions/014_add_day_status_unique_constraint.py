"""Add unique constraint on day_statuses (user_id, date) and remove duplicates

Revision ID: 014
Revises: 013
Create Date: 2026-02-27

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove duplicate day_statuses keeping only the latest one per (user_id, date)
    op.execute("""
        DELETE FROM day_statuses
        WHERE id NOT IN (
            SELECT MAX(id) FROM day_statuses GROUP BY user_id, date
        )
    """)
    op.create_unique_constraint('uq_day_status_user_date', 'day_statuses', ['user_id', 'date'])


def downgrade() -> None:
    op.drop_constraint('uq_day_status_user_date', 'day_statuses', type_='unique')
