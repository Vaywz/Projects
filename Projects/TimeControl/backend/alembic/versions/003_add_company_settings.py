"""Add company_settings table

Revision ID: 003
Revises: 002
Create Date: 2024-01-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'company_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_company_settings_id'), 'company_settings', ['id'], unique=False)
    op.create_index(op.f('ix_company_settings_key'), 'company_settings', ['key'], unique=True)

    # Insert default settings
    op.execute("""
        INSERT INTO company_settings (key, value, created_at, updated_at) VALUES
        ('logo_url', NULL, NOW(), NOW()),
        ('icon_vacation', 'Palmtree', NOW(), NOW()),
        ('icon_sick', 'Cross', NOW(), NOW()),
        ('icon_office', 'Building2', NOW(), NOW()),
        ('icon_remote', 'Monitor', NOW(), NOW()),
        ('icon_holiday', 'Gift', NOW(), NOW()),
        ('icon_excused', 'CircleCheckBig', NOW(), NOW())
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_company_settings_key'), table_name='company_settings')
    op.drop_index(op.f('ix_company_settings_id'), table_name='company_settings')
    op.drop_table('company_settings')
