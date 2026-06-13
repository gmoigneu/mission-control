import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AgentRun(Base):
    __tablename__ = "agent_run"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    surface: Mapped[str] = mapped_column(String)  # chat|capture|voice
    input: Mapped[str] = mapped_column(Text)
    # The chat thread this run belongs to. Null for capture/voice (one-shot) runs.
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_conversation.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # This turn's transcript only (NOT seeded history) — user input, tool calls,
    # and Aya's final reply. Concatenating a thread's run transcripts in order
    # reproduces the full conversation for replay.
    transcript: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    tool_calls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # Aya's final text reply, stored explicitly so the UI can rebuild the thread
    # without parsing the transcript JSON.
    reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="ok")  # ok|error
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Python-side default so rows created inside one DB transaction (e.g. tests,
    # or rapid requests) still get distinct, insertion-ordered timestamps — the
    # thread's runs are replayed in created_at order.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )
