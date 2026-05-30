import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OutboxEvent(Base):
    __tablename__ = "outbox_event"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aggregate_type: Mapped[str] = mapped_column(String, index=True)
    aggregate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    op: Mapped[str] = mapped_column(String)  # "upsert" | "delete"
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
