import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inbox_item",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column(
            "source_type", sa.String(), nullable=False, server_default="other"
        ),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(), nullable=False, server_default="queued"
        ),
        sa.Column(
            "priority", sa.String(), nullable=False, server_default="normal"
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_type IN ('repo', 'article', 'tool', 'idea', 'video', 'other')",
            name="ck_inbox_item_source_type",
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'reviewed', 'archived')",
            name="ck_inbox_item_status",
        ),
        sa.CheckConstraint(
            "priority IN ('low', 'normal', 'high')",
            name="ck_inbox_item_priority",
        ),
    )
    op.create_index("ix_inbox_item_status", "inbox_item", ["status"])


def downgrade() -> None:
    op.drop_index("ix_inbox_item_status", table_name="inbox_item")
    op.drop_table("inbox_item")
