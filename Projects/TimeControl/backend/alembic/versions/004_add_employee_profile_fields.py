"""Add new employee profile fields

Revision ID: 004
Revises: 003
Create Date: 2024-01-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create employment_type enum
    op.execute("CREATE TYPE employmenttype AS ENUM ('full_time', 'part_time')")

    # Create payment_type enum
    op.execute("CREATE TYPE paymenttype AS ENUM ('salary', 'hourly')")

    # Add new columns
    op.add_column('employee_profiles', sa.Column('work_email', sa.String(255), nullable=True))
    op.add_column('employee_profiles', sa.Column('employment_type',
        sa.Enum('full_time', 'part_time', name='employmenttype', create_type=False),
        nullable=True, server_default='full_time'))
    op.add_column('employee_profiles', sa.Column('payment_type',
        sa.Enum('salary', 'hourly', name='paymenttype', create_type=False),
        nullable=True, server_default='salary'))
    op.add_column('employee_profiles', sa.Column('birthday', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('employee_profiles', 'birthday')
    op.drop_column('employee_profiles', 'payment_type')
    op.drop_column('employee_profiles', 'employment_type')
    op.drop_column('employee_profiles', 'work_email')

    # Drop enums
    op.execute("DROP TYPE IF EXISTS paymenttype")
    op.execute("DROP TYPE IF EXISTS employmenttype")