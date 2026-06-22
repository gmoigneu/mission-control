import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ProactiveRun(Base):
    __tablename__ = "proactive_run"
    __table_args__ = (
        CheckConstraint(
            "outcome in ('sent', 'opened', 'dismissed', 'muted', 'acted', 'expired')",
            name="ck_proactive_run_outcome",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), index=True
    )
    routine_type: Mapped[str] = mapped_column(String, index=True)
    routine_name: Mapped[str] = mapped_column(String)
    trigger_reason: Mapped[str] = mapped_column(Text)
    trigger_data_summary: Mapped[str] = mapped_column(Text)
    related_entities: Mapped[list] = mapped_column(JSONB, default=list)
    policy_decision: Mapped[str] = mapped_column(String)
    channels: Mapped[list] = mapped_column(JSONB, default=list)
    message_title: Mapped[str] = mapped_column(String)
    message_summary: Mapped[str] = mapped_column(Text)
    message_body: Mapped[str] = mapped_column(Text)
    delivery_status: Mapped[dict] = mapped_column(JSONB, default=dict)
    outcome: Mapped[str] = mapped_column(String, default="sent", index=True)
    agent_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_run.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    audit_log_ids: Mapped[list] = mapped_column(JSONB, default=list)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    muted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
