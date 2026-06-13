"""agent_conversation table + agent_run.conversation_id / reply

Revision ID: 0031
Revises: 0030
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_conversation",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_agent_conversation_user_id", "agent_conversation", ["user_id"]
    )

    op.add_column(
        "agent_run",
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("agent_run", sa.Column("reply", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_agent_run_conversation_id",
        "agent_run",
        "agent_conversation",
        ["conversation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_agent_run_conversation_id", "agent_run", ["conversation_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_agent_run_conversation_id", table_name="agent_run")
    op.drop_constraint("fk_agent_run_conversation_id", "agent_run", type_="foreignkey")
    op.drop_column("agent_run", "reply")
    op.drop_column("agent_run", "conversation_id")
    op.drop_index("ix_agent_conversation_user_id", table_name="agent_conversation")
    op.drop_table("agent_conversation")
