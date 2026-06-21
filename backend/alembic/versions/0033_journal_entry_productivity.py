"""add productivity to journal entries

Revision ID: 0033
Revises: 0032
"""
import sqlalchemy as sa

from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("journal_entry", sa.Column("productivity", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("journal_entry", "productivity")
