"""Initial migration

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.Enum('employee', 'admin', name='userrole'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # Employee profiles table
    op.create_table(
        'employee_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=False),
        sa.Column('last_name', sa.String(length=100), nullable=False),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
        sa.Column('bank_account', sa.String(length=50), nullable=True),
        sa.Column('position', sa.String(length=100), nullable=True),
        sa.Column('default_workplace', sa.Enum('office', 'remote', name='workplacetype'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_employee_profiles_id'), 'employee_profiles', ['id'], unique=False)

    # Calendar days table
    op.create_table(
        'calendar_days',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('day_type', sa.Enum('workday', 'weekend', 'holiday', name='daytype'), nullable=False),
        sa.Column('holiday_name', sa.String(length=255), nullable=True),
        sa.Column('holiday_name_lv', sa.String(length=255), nullable=True),
        sa.Column('holiday_name_en', sa.String(length=255), nullable=True),
        sa.Column('country', sa.String(length=10), nullable=False, default='LV'),
        sa.Column('is_working_day', sa.Boolean(), nullable=False, default=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_calendar_days_date'), 'calendar_days', ['date'], unique=True)
    op.create_index(op.f('ix_calendar_days_id'), 'calendar_days', ['id'], unique=False)

    # Time entries table
    op.create_table(
        'time_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('break_minutes', sa.Integer(), nullable=False, default=0),
        sa.Column('workplace', sa.Enum('office', 'remote', name='workplacetype'), nullable=False),
        sa.Column('comment', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_time_entries_id'), 'time_entries', ['id'], unique=False)
    op.create_index(op.f('ix_time_entries_user_id'), 'time_entries', ['user_id'], unique=False)
    op.create_index(op.f('ix_time_entries_date'), 'time_entries', ['date'], unique=False)

    # Day statuses table
    op.create_table(
        'day_statuses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('status', sa.Enum('normal', 'sick', 'vacation', name='statustype'), nullable=False),
        sa.Column('auto_skip_day', sa.Boolean(), nullable=False, default=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_day_statuses_id'), 'day_statuses', ['id'], unique=False)
    op.create_index(op.f('ix_day_statuses_user_id'), 'day_statuses', ['user_id'], unique=False)
    op.create_index(op.f('ix_day_statuses_date'), 'day_statuses', ['date'], unique=False)

    # Vacations table
    op.create_table(
        'vacations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date_from', sa.Date(), nullable=False),
        sa.Column('date_to', sa.Date(), nullable=False),
        sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='vacationstatus'), nullable=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vacations_id'), 'vacations', ['id'], unique=False)
    op.create_index(op.f('ix_vacations_user_id'), 'vacations', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('vacations')
    op.drop_table('day_statuses')
    op.drop_table('time_entries')
    op.drop_table('calendar_days')
    op.drop_table('employee_profiles')
    op.drop_table('users')

    op.execute('DROP TYPE IF EXISTS vacationstatus')
    op.execute('DROP TYPE IF EXISTS statustype')
    op.execute('DROP TYPE IF EXISTS daytype')
    op.execute('DROP TYPE IF EXISTS workplacetype')
    op.execute('DROP TYPE IF EXISTS userrole')
