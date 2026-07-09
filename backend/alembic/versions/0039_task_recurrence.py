"""add task recurrence templates

Revision ID: 0039
Revises: 0038
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_recurrence",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("priority", sa.String(), nullable=False, server_default="normal"),
        sa.Column("context_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("outcome", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("frequency", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=True),
        sa.Column("month_day", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
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
        sa.CheckConstraint(
            "frequency IN ('daily', 'weekly', 'monthly')",
            name="ck_task_recurrence_frequency",
        ),
        sa.CheckConstraint(
            "weekday IS NULL OR (weekday >= 0 AND weekday <= 6)",
            name="ck_task_recurrence_weekday",
        ),
        sa.CheckConstraint(
            "month_day IS NULL OR (month_day >= 1 AND month_day <= 31)",
            name="ck_task_recurrence_month_day",
        ),
        sa.ForeignKeyConstraint(["context_id"], ["context.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_recurrence_context_id", "task_recurrence", ["context_id"])
    op.create_index("ix_task_recurrence_project_id", "task_recurrence", ["project_id"])
    op.create_index("ix_task_recurrence_active", "task_recurrence", ["active"])

    op.add_column("task", sa.Column("recurrence_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_task_recurrence_id", "task", ["recurrence_id"])
    op.create_foreign_key(
        "fk_task_recurrence_id_task_recurrence",
        "task",
        "task_recurrence",
        ["recurrence_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_task_recurrence_id_task_recurrence", "task", type_="foreignkey")
    op.drop_index("ix_task_recurrence_id", table_name="task")
    op.drop_column("task", "recurrence_id")

    op.drop_index("ix_task_recurrence_active", table_name="task_recurrence")
    op.drop_index("ix_task_recurrence_project_id", table_name="task_recurrence")
    op.drop_index("ix_task_recurrence_context_id", table_name="task_recurrence")
    op.drop_table("task_recurrence")
