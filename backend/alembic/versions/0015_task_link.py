import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_link",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "from_task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("task.id"),
            nullable=False,
        ),
        sa.Column(
            "to_task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("task.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(), nullable=False, server_default="related"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("from_task_id", "to_task_id", "kind", name="uq_task_link"),
    )
    op.create_index("ix_task_link_from_task_id", "task_link", ["from_task_id"])
    op.create_index("ix_task_link_to_task_id", "task_link", ["to_task_id"])


def downgrade() -> None:
    op.drop_index("ix_task_link_to_task_id", table_name="task_link")
    op.drop_index("ix_task_link_from_task_id", table_name="task_link")
    op.drop_table("task_link")
