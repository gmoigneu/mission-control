"""add capture provenance pipeline

Revision ID: 0036
Revises: 0035
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "capture",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("source_surface", sa.String(), nullable=False),
        sa.Column("source_metadata", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("status", sa.String(), server_default="raw", nullable=False),
        sa.Column("confidence_summary", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("structured_result", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("agent_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_entity_refs", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("inbox_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_run.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["inbox_item_id"], ["inbox_item.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_capture_status", "capture", ["status"])
    op.add_column(
        "inbox_item",
        sa.Column("capture_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("inbox_item", sa.Column("triage_reason", sa.Text(), nullable=True))
    op.add_column("inbox_item", sa.Column("suggested_action", sa.Text(), nullable=True))
    op.add_column(
        "inbox_item",
        sa.Column("source_metadata", postgresql.JSONB(), server_default="{}", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("inbox_item", "source_metadata")
    op.drop_column("inbox_item", "suggested_action")
    op.drop_column("inbox_item", "triage_reason")
    op.drop_column("inbox_item", "capture_id")
    op.drop_index("ix_capture_status", table_name="capture")
    op.drop_table("capture")
