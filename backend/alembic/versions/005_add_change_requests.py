"""Add change requests table

Revision ID: 005
Revises: 004
Create Date: 2024-01-20
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    # Create all with raw SQL to avoid SQLAlchemy enum creation issues
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE changerequeststatus AS ENUM ('pending', 'approved', 'rejected');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE changerequesttype AS ENUM ('add', 'edit', 'delete');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS change_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            request_type changerequesttype NOT NULL,
            time_entry_id INTEGER REFERENCES time_entries(id) ON DELETE SET NULL,
            date DATE NOT NULL,
            start_time TIME,
            end_time TIME,
            break_minutes INTEGER,
            workplace VARCHAR(20),
            comment TEXT,
            reason TEXT NOT NULL,
            status changerequeststatus DEFAULT 'pending',
            admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            admin_comment TEXT,
            resolved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_change_requests_id ON change_requests(id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_change_requests_user_id ON change_requests(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_change_requests_status ON change_requests(status);")


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_change_requests_status;")
    op.execute("DROP INDEX IF EXISTS ix_change_requests_user_id;")
    op.execute("DROP INDEX IF EXISTS ix_change_requests_id;")
    op.execute("DROP TABLE IF EXISTS change_requests;")
    op.execute("DROP TYPE IF EXISTS changerequesttype;")
    op.execute("DROP TYPE IF EXISTS changerequeststatus;")