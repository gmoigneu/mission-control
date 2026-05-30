import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Task(Base):
    __tablename__ = "task"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="open")  # open|in_progress|done|archived
    priority: Mapped[str] = mapped_column(String, default="normal")  # low|normal|high
    due: Mapped[date | None] = mapped_column(Date, nullable=True)
    scheduled: Mapped[date | None] = mapped_column(Date, nullable=True)
    context_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("context.id"), nullable=True, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project.id"), nullable=True, index=True
    )
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
