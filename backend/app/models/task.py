from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TaskRecurrence(Base):
    __tablename__ = "task_recurrence"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String)
    priority: Mapped[str] = mapped_column(String, default="normal")
    context_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("context.id"), nullable=True, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project.id"), nullable=True, index=True
    )
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    frequency: Mapped[str] = mapped_column(String)
    start_date: Mapped[date] = mapped_column(Date)
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    month_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    tasks: Mapped[list[Task]] = relationship(back_populates="recurrence")


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
    recurrence_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("task_recurrence.id", ondelete="SET NULL"), nullable=True, index=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    recurrence: Mapped[TaskRecurrence | None] = relationship(back_populates="tasks")
