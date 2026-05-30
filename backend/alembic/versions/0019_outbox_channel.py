"""outbox_event.channel for per-consumer fan-out (graph | search)

Revision ID: 0019
Revises: 0018
"""
import sqlalchemy as sa

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing rows were graph-only events; default them to the graph channel.
    op.add_column(
        "outbox_event",
        sa.Column(
            "channel",
            sa.String(),
            nullable=False,
            server_default="graph",
        ),
    )
    # Each worker filters on (channel, processed_at IS NULL); make that cheap.
    op.create_index(
        "ix_outbox_channel_unprocessed",
        "outbox_event",
        ["channel", "processed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_outbox_channel_unprocessed", table_name="outbox_event")
    op.drop_column("outbox_event", "channel")
