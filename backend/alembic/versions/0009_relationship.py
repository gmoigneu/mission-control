import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "relationship",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "from_person_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("person.id"),
            nullable=False,
        ),
        sa.Column(
            "to_person_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("person.id"),
            nullable=False,
        ),
        sa.Column("type", sa.String(), nullable=False, server_default="knows"),
        sa.Column(
            "context_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("context.id"), nullable=True
        ),
        sa.Column("since", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "from_person_id", "to_person_id", "type", name="uq_relationship_edge"
        ),
    )
    op.create_index("ix_relationship_from_person_id", "relationship", ["from_person_id"])
    op.create_index("ix_relationship_to_person_id", "relationship", ["to_person_id"])


def downgrade() -> None:
    op.drop_index("ix_relationship_to_person_id", table_name="relationship")
    op.drop_index("ix_relationship_from_person_id", table_name="relationship")
    op.drop_table("relationship")
