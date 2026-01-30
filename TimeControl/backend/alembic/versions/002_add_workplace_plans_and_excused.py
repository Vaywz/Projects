"""Add workplace_plans table and excused status

Revision ID: 002
Revises: 001
Create Date: 2024-01-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'excused' value to statustype enum
    # For PostgreSQL, we need to alter the enum type
    op.execute("ALTER TYPE statustype ADD VALUE IF NOT EXISTS 'excused'")

    # Create workplace_plans table using raw SQL to avoid enum recreation
    op.execute("""
        CREATE TABLE workplace_plans (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            workplace workplacetype NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_workplace_plans_id ON workplace_plans (id)")
    op.execute("CREATE INDEX ix_workplace_plans_user_id ON workplace_plans (user_id)")
    op.execute("CREATE INDEX ix_workplace_plans_date ON workplace_plans (date)")
    op.execute("CREATE UNIQUE INDEX uq_workplace_plans_user_date ON workplace_plans (user_id, date)")


def downgrade() -> None:
    op.drop_constraint('uq_workplace_plans_user_date', 'workplace_plans', type_='unique')
    op.drop_index(op.f('ix_workplace_plans_date'), table_name='workplace_plans')
    op.drop_index(op.f('ix_workplace_plans_user_id'), table_name='workplace_plans')
    op.drop_index(op.f('ix_workplace_plans_id'), table_name='workplace_plans')
    op.drop_table('workplace_plans')