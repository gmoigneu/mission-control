import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "journal_entry",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("mood", sa.SmallInteger(), nullable=True),
        sa.Column("energy", sa.SmallInteger(), nullable=True),
        sa.Column("telos_alignment", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("mood IS NULL OR (mood BETWEEN 1 AND 5)", name="ck_journal_entry_mood"),
        sa.CheckConstraint(
            "energy IS NULL OR (energy BETWEEN 1 AND 5)", name="ck_journal_entry_energy"
        ),
    )
    op.create_index(
        "ix_journal_entry_date", "journal_entry", ["date"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_journal_entry_date", table_name="journal_entry")
    op.drop_table("journal_entry")
