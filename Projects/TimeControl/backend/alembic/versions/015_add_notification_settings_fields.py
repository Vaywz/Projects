"""Add missing_entry and overtime_warning fields to notification_settings

Revision ID: 015
Revises: 014
Create Date: 2026-03-04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('notification_settings', sa.Column('email_missing_entry', sa.Boolean(), server_default='true', nullable=True))
    op.add_column('notification_settings', sa.Column('email_overtime_warning', sa.Boolean(), server_default='true', nullable=True))
    op.add_column('notification_settings', sa.Column('app_missing_entry', sa.Boolean(), server_default='true', nullable=True))
    op.add_column('notification_settings', sa.Column('app_overtime_warning', sa.Boolean(), server_default='true', nullable=True))


def downgrade() -> None:
    op.drop_column('notification_settings', 'app_overtime_warning')
    op.drop_column('notification_settings', 'app_missing_entry')
    op.drop_column('notification_settings', 'email_overtime_warning')
    op.drop_column('notification_settings', 'email_missing_entry')
