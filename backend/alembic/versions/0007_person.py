import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "person",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("company.id"),
            nullable=True,
        ),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("linkedin", sa.String(), nullable=True),
        sa.Column("first_met", sa.Date(), nullable=True),
        sa.Column(
            "primary_context_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("context.id"),
            nullable=True,
        ),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "archived", sa.Boolean(), nullable=False, server_default="false"
        ),
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
    )
    op.create_index("ix_person_slug", "person", ["slug"], unique=True)
    op.create_index("ix_person_company_id", "person", ["company_id"])
    op.create_index("ix_person_primary_context_id", "person", ["primary_context_id"])


def downgrade() -> None:
    op.drop_index("ix_person_primary_context_id", table_name="person")
    op.drop_index("ix_person_company_id", table_name="person")
    op.drop_index("ix_person_slug", table_name="person")
    op.drop_table("person")
