"""add habit tracking type and score logs

Revision ID: 0034
Revises: 0033
"""
import sqlalchemy as sa

from alembic import op

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "habit",
        sa.Column("tracking_type", sa.String(), server_default="boolean", nullable=False),
    )
    op.add_column("habit_log", sa.Column("score", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("habit_log", "score")
    op.drop_column("habit", "tracking_type")
