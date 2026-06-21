"""proactive run log

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
        "proactive_run",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("routine_type", sa.String(), nullable=False),
        sa.Column("routine_name", sa.String(), nullable=False),
        sa.Column("trigger_reason", sa.Text(), nullable=False),
        sa.Column("trigger_data_summary", sa.Text(), nullable=False),
        sa.Column(
            "related_entities",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("policy_decision", sa.String(), nullable=False),
        sa.Column(
            "channels",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("message_title", sa.String(), nullable=False),
        sa.Column("message_summary", sa.Text(), nullable=False),
        sa.Column("message_body", sa.Text(), nullable=False),
        sa.Column(
            "delivery_status",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("outcome", sa.String(), server_default="sent", nullable=False),
        sa.Column("agent_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "audit_log_ids",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("muted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "outcome in ('sent', 'opened', 'dismissed', 'muted', 'acted', 'expired')",
            name="ck_proactive_run_outcome",
        ),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_run.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_proactive_run_user_id", "proactive_run", ["user_id"])
    op.create_index("ix_proactive_run_agent_run_id", "proactive_run", ["agent_run_id"])
    op.create_index("ix_proactive_run_outcome", "proactive_run", ["outcome"])
    op.create_index("ix_proactive_run_routine_type", "proactive_run", ["routine_type"])


def downgrade() -> None:
    op.drop_index("ix_proactive_run_user_id", table_name="proactive_run")
    op.drop_index("ix_proactive_run_routine_type", table_name="proactive_run")
    op.drop_index("ix_proactive_run_outcome", table_name="proactive_run")
    op.drop_index("ix_proactive_run_agent_run_id", table_name="proactive_run")
    op.drop_table("proactive_run")
