import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, SmallInteger, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class JournalEntry(Base):
    __tablename__ = "journal_entry"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date, unique=True)  # one entry per date
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # daily review prose
    mood: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)  # 1–5
    energy: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)  # 1–5
    telos_alignment: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)  # markdown
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
