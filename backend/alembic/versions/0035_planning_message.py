"""add planning messages

Revision ID: 0035
Revises: 0034
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "planning_message",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("body", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("related_task_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "related_inbox_item_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("app_link", sa.String(), nullable=False),
        sa.Column("sent_channels", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("agent_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_run.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_planning_message_agent_run_id", "planning_message", ["agent_run_id"])
    op.create_index("ix_planning_message_target_date", "planning_message", ["target_date"])


def downgrade() -> None:
    op.drop_index("ix_planning_message_target_date", table_name="planning_message")
    op.drop_index("ix_planning_message_agent_run_id", table_name="planning_message")
    op.drop_table("planning_message")
