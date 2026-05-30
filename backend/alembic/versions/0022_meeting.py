import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0022"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meeting",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "context_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("context.id"),
            nullable=True,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("project.id"),
            nullable=True,
        ),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_meeting_slug", "meeting", ["slug"], unique=True)
    op.create_index("ix_meeting_context_id", "meeting", ["context_id"])
    op.create_index("ix_meeting_project_id", "meeting", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_meeting_project_id", table_name="meeting")
    op.drop_index("ix_meeting_context_id", table_name="meeting")
    op.drop_index("ix_meeting_slug", table_name="meeting")
    op.drop_table("meeting")
