import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AgentConversation(Base):
    """A chat thread between the user and Aya.

    One row per conversation. The thread's messages are the ordered ``agent_run``
    rows that reference it (see :class:`~app.models.agent_run.AgentRun`). The
    user's *current* thread is simply their most recently created conversation;
    "/new" inserts a fresh row, which then becomes current.
    """

    __tablename__ = "agent_conversation"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="CASCADE"), index=True
    )
    # Optional human label; unused for now, reserved for a future history list.
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    # Python-side default so the user's *current* thread (the most recently
    # created one) is unambiguous even when rows share a DB transaction.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
