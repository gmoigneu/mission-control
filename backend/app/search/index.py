import logging
import uuid
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.search.embedder import embed_text

_logger = logging.getLogger(__name__)


def render_subject(subject_type: str, obj: Any) -> str:
    """Render an entity to a single searchable text blob."""
    parts: list[str] = []
    for attr in ("name", "title", "slug", "role", "summary", "purpose", "body", "outcome",
                 "description", "notes", "type", "kind", "category", "status", "email"):
        val = getattr(obj, attr, None)
        if val:
            parts.append(str(val))
    return " — ".join(parts)


async def index_subject(db: AsyncSession, subject_type: str, obj: Any) -> None:
    # Delete stale chunks unconditionally so the write path is never blocked by
    # a failed embed; the chunk simply won't be recreated on error.
    await db.execute(
        delete(Chunk).where(Chunk.subject_type == subject_type, Chunk.subject_id == obj.id)
    )
    text = render_subject(subject_type, obj)
    if not text.strip():
        return
    try:
        embedding = await embed_text(text)
        db.add(
            Chunk(
                subject_type=subject_type, subject_id=obj.id, chunk_index=0,
                content=text, embedding=embedding,
            )
        )
        await db.flush()
    except Exception:
        _logger.exception(
            "Failed to index %s %s — write will still commit, chunk skipped",
            subject_type, obj.id,
        )


async def deindex_subject(db: AsyncSession, subject_type: str, subject_id: uuid.UUID) -> None:
    await db.execute(
        delete(Chunk).where(Chunk.subject_type == subject_type, Chunk.subject_id == subject_id)
    )
    await db.flush()
