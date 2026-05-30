import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class EntityLink(Base):
    __tablename__ = "entity_link"
    __table_args__ = (
        Index("ix_entity_link_from", "from_type", "from_id"),
        Index("ix_entity_link_to", "to_type", "to_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_type: Mapped[str] = mapped_column(String)
    from_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    to_type: Mapped[str] = mapped_column(String)
    to_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    kind: Mapped[str] = mapped_column(String, default="related")  # related|source|mentions|...
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
