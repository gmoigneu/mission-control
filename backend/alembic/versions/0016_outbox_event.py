import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "outbox_event",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("aggregate_type", sa.String(), nullable=False),
        sa.Column("aggregate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("op", sa.String(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_outbox_event_aggregate_type", "outbox_event", ["aggregate_type"])
    op.create_index("ix_outbox_unprocessed", "outbox_event", ["processed_at"])


def downgrade() -> None:
    op.drop_index("ix_outbox_unprocessed", table_name="outbox_event")
    op.drop_index("ix_outbox_event_aggregate_type", table_name="outbox_event")
    op.drop_table("outbox_event")
