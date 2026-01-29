"""Add extended employee profile fields, departments and notifications

Revision ID: 006
Revises: 005
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new fields to employee_profiles
    op.add_column('employee_profiles', sa.Column('department', sa.String(100), nullable=True))
    op.add_column('employee_profiles', sa.Column('name_day', sa.Date(), nullable=True))
    op.add_column('employee_profiles', sa.Column('contract_number', sa.String(50), nullable=True))
    op.add_column('employee_profiles', sa.Column('employment_start_date', sa.Date(), nullable=True))
    op.add_column('employee_profiles', sa.Column('emergency_contact_name', sa.String(200), nullable=True))
    op.add_column('employee_profiles', sa.Column('emergency_contact_phone', sa.String(50), nullable=True))
    op.add_column('employee_profiles', sa.Column('declared_address', sa.String(500), nullable=True))

    # Create departments table
    op.create_table(
        'departments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index('ix_departments_id', 'departments', ['id'])

    # Insert default departments
    op.execute("""
        INSERT INTO departments (name, is_default, created_at) VALUES
        ('SEO', true, NOW()),
        ('Frontend', true, NOW()),
        ('Backend', true, NOW()),
        ('Design', true, NOW()),
        ('Marketing', true, NOW()),
        ('Management', true, NOW())
    """)

    # Create notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('birthday', 'name_day', 'change_request', 'weekly_reminder', 'system', name='notificationtype'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), default=False),
        sa.Column('related_user_id', sa.Integer(), nullable=True),
        sa.Column('related_request_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['related_user_id'], ['users.id'], ondelete='SET NULL')
    )
    op.create_index('ix_notifications_id', 'notifications', ['id'])
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])

    # Create notification_settings table
    op.create_table(
        'notification_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('email_birthday', sa.Boolean(), default=True),
        sa.Column('email_name_day', sa.Boolean(), default=True),
        sa.Column('email_change_request', sa.Boolean(), default=True),
        sa.Column('email_weekly_reminder', sa.Boolean(), default=False),
        sa.Column('app_birthday', sa.Boolean(), default=True),
        sa.Column('app_name_day', sa.Boolean(), default=True),
        sa.Column('app_change_request', sa.Boolean(), default=True),
        sa.Column('app_weekly_reminder', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id')
    )
    op.create_index('ix_notification_settings_id', 'notification_settings', ['id'])


def downgrade() -> None:
    op.drop_table('notification_settings')
    op.drop_table('notifications')
    op.execute("DROP TYPE IF EXISTS notificationtype")
    op.drop_table('departments')
    op.drop_column('employee_profiles', 'declared_address')
    op.drop_column('employee_profiles', 'emergency_contact_phone')
    op.drop_column('employee_profiles', 'emergency_contact_name')
    op.drop_column('employee_profiles', 'employment_start_date')
    op.drop_column('employee_profiles', 'contract_number')
    op.drop_column('employee_profiles', 'name_day')
    op.drop_column('employee_profiles', 'department')