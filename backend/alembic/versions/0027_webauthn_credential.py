"""webauthn_credential table

Revision ID: 0027
Revises: 0018
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0027"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webauthn_credential",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("transports", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_webauthn_credential_user_id", "webauthn_credential", ["user_id"], unique=False
    )
    op.create_index(
        "ix_webauthn_credential_credential_id",
        "webauthn_credential",
        ["credential_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_webauthn_credential_credential_id", table_name="webauthn_credential")
    op.drop_index("ix_webauthn_credential_user_id", table_name="webauthn_credential")
    op.drop_table("webauthn_credential")
