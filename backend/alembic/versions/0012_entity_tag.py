import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entity_tag",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tag_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tag.id"),
            nullable=False,
        ),
        sa.Column("subject_type", sa.String(), nullable=False),
        sa.Column("subject_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_entity_tag_tag_id", "entity_tag", ["tag_id"])
    op.create_index("ix_entity_tag_subject", "entity_tag", ["subject_type", "subject_id"])
    op.create_unique_constraint(
        "uq_entity_tag", "entity_tag", ["tag_id", "subject_type", "subject_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_entity_tag", "entity_tag", type_="unique")
    op.drop_index("ix_entity_tag_subject", table_name="entity_tag")
    op.drop_index("ix_entity_tag_tag_id", table_name="entity_tag")
    op.drop_table("entity_tag")
