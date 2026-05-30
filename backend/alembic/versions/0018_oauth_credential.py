"""oauth_credential table

Revision ID: 0018
Revises: 0017
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql  # noqa: F401

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oauth_credential",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("id_token", sa.Text(), nullable=True),
        sa.Column("account_id", sa.String(), nullable=True),
        sa.Column("plan_type", sa.String(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_oauth_credential_provider", "oauth_credential", ["provider"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_oauth_credential_provider", table_name="oauth_credential")
    op.drop_table("oauth_credential")
