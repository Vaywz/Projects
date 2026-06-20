"""Convert employment_type and payment_type from ENUM to VARCHAR, add actual_address

Revision ID: 013
Revises: 012
Create Date: 2026-02-12

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add actual_address column
    op.add_column('employee_profiles', sa.Column('actual_address', sa.String(500), nullable=True))

    # 2. Convert employment_type: ENUM -> VARCHAR via temp column
    op.add_column('employee_profiles', sa.Column('employment_type_new', sa.String(50), nullable=True, server_default='full_time'))
    op.execute("UPDATE employee_profiles SET employment_type_new = employment_type::text")
    op.drop_column('employee_profiles', 'employment_type')
    op.alter_column('employee_profiles', 'employment_type_new', new_column_name='employment_type')

    # 3. Convert payment_type: ENUM -> VARCHAR via temp column
    op.add_column('employee_profiles', sa.Column('payment_type_new', sa.String(50), nullable=True, server_default='salary'))
    op.execute("UPDATE employee_profiles SET payment_type_new = payment_type::text")
    op.drop_column('employee_profiles', 'payment_type')
    op.alter_column('employee_profiles', 'payment_type_new', new_column_name='payment_type')

    # 4. Drop old ENUM types
    op.execute("DROP TYPE IF EXISTS employmenttype")
    op.execute("DROP TYPE IF EXISTS paymenttype")


def downgrade() -> None:
    # 1. Recreate ENUM types
    op.execute("CREATE TYPE employmenttype AS ENUM ('full_time', 'part_time')")
    op.execute("CREATE TYPE paymenttype AS ENUM ('salary', 'hourly')")

    # 2. Convert employment_type back: VARCHAR -> ENUM
    op.add_column('employee_profiles', sa.Column('employment_type_old',
        sa.Enum('full_time', 'part_time', name='employmenttype', create_type=False),
        nullable=True, server_default='full_time'))
    op.execute("UPDATE employee_profiles SET employment_type_old = CASE WHEN employment_type IN ('full_time', 'part_time') THEN employment_type::employmenttype ELSE 'full_time'::employmenttype END")
    op.drop_column('employee_profiles', 'employment_type')
    op.alter_column('employee_profiles', 'employment_type_old', new_column_name='employment_type')

    # 3. Convert payment_type back: VARCHAR -> ENUM
    op.add_column('employee_profiles', sa.Column('payment_type_old',
        sa.Enum('salary', 'hourly', name='paymenttype', create_type=False),
        nullable=True, server_default='salary'))
    op.execute("UPDATE employee_profiles SET payment_type_old = CASE WHEN payment_type IN ('salary', 'hourly') THEN payment_type::paymenttype ELSE 'salary'::paymenttype END")
    op.drop_column('employee_profiles', 'payment_type')
    op.alter_column('employee_profiles', 'payment_type_old', new_column_name='payment_type')

    # 4. Drop actual_address
    op.drop_column('employee_profiles', 'actual_address')
