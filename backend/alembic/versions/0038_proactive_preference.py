"""add proactive preference records

Revision ID: 0038
Revises: 0037
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "proactive_preference",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("preference_type", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("routine_type", sa.String(), nullable=True),
        sa.Column("entity_type", sa.String(), nullable=True),
        sa.Column("entity_ref", sa.String(), nullable=True),
        sa.Column("trigger_ref", sa.String(), nullable=True),
        sa.Column(
            "value",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("source_proactive_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("requires_confirmation", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
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
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "user_id",
        "preference_type",
        "scope",
        "routine_type",
        "entity_type",
        "entity_ref",
        "trigger_ref",
        "source_proactive_run_id",
        "active",
    ):
        op.create_index(f"ix_proactive_preference_{column}", "proactive_preference", [column])


def downgrade() -> None:
    op.drop_table("proactive_preference")
