import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TaskLink(Base):
    __tablename__ = "task_link"
    __table_args__ = (
        UniqueConstraint("from_task_id", "to_task_id", "kind", name="uq_task_link"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("task.id"), nullable=False, index=True
    )
    to_task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("task.id"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String, default="related")  # related|blocks|duplicates
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
