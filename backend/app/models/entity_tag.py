import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class EntityTag(Base):
    __tablename__ = "entity_tag"
    __table_args__ = (
        UniqueConstraint("tag_id", "subject_type", "subject_id", name="uq_entity_tag"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tag.id"), index=True)
    subject_type: Mapped[str] = mapped_column(String)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
