import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ProactivePreference(Base):
    __tablename__ = "proactive_preference"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    preference_type: Mapped[str] = mapped_column(String, index=True)
    scope: Mapped[str] = mapped_column(String, index=True)  # global|routine|entity_topic|trigger
    routine_type: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    entity_type: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    entity_ref: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    trigger_ref: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    value: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    source_proactive_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    requires_confirmation: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
