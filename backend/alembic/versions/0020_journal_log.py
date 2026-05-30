import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "journal_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "journal_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("journal_entry.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_journal_log_journal_entry_id", "journal_log", ["journal_entry_id"])


def downgrade() -> None:
    op.drop_index("ix_journal_log_journal_entry_id", table_name="journal_log")
    op.drop_table("journal_log")
