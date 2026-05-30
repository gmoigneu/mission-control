import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entity_link",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("from_type", sa.String(), nullable=False),
        sa.Column("from_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_type", sa.String(), nullable=False),
        sa.Column("to_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="related"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_entity_link_from", "entity_link", ["from_type", "from_id"])
    op.create_index("ix_entity_link_to", "entity_link", ["to_type", "to_id"])


def downgrade() -> None:
    op.drop_index("ix_entity_link_to", table_name="entity_link")
    op.drop_index("ix_entity_link_from", table_name="entity_link")
    op.drop_table("entity_link")
