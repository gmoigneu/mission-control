import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class PlanningMessage(Base):
    __tablename__ = "planning_message"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="draft")
    title: Mapped[str] = mapped_column(String)
    summary: Mapped[str] = mapped_column(Text)
    body: Mapped[dict] = mapped_column(JSONB, default=dict)
    related_task_ids: Mapped[list] = mapped_column(JSONB, default=list)
    related_inbox_item_ids: Mapped[list] = mapped_column(JSONB, default=list)
    target_date: Mapped[date] = mapped_column(Date, index=True)
    app_link: Mapped[str] = mapped_column(String)
    sent_channels: Mapped[list] = mapped_column(JSONB, default=list)
    agent_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_run.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now(), onupdate=_utcnow
    )
