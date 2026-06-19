"""telegram_chat table — binds a Telegram chat to a user + dedicated thread

Revision ID: 0032
Revises: 0031
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telegram_chat",
        sa.Column("chat_id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agent_conversation.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_telegram_chat_user_id", "telegram_chat", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_telegram_chat_user_id", table_name="telegram_chat")
    op.drop_table("telegram_chat")
