import logging
import uuid
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chunk import Chunk
from app.outbox.service import enqueue_event
from app.search.embedder import embed_text

_logger = logging.getLogger(__name__)

# Outbox aggregate used to defer search indexing to the worker.
INDEX_AGGREGATE = "index"

# Bounded character window used to split long bodies into multiple chunks.
# Overlap is kept at 0 to keep chunk boundaries deterministic and simple.
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 0


def render_subject(subject_type: str, obj: Any) -> str:
    """Render an entity to a single searchable text blob."""
    parts: list[str] = []
    for attr in ("name", "title", "slug", "role", "summary", "purpose", "body", "outcome",
                 "description", "notes", "type", "kind", "category", "status", "email"):
        val = getattr(obj, attr, None)
        if val:
            parts.append(str(val))
    return " — ".join(parts)


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into bounded windows. Short text yields a single chunk."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    step = max(1, size - overlap)
    chunks: list[str] = []
    start = 0
    while start < len(text):
        chunks.append(text[start : start + size])
        start += step
    return chunks


async def index_subject(db: AsyncSession, subject_type: str, obj: Any) -> None:
    # Delete stale chunks unconditionally so the write path is never blocked by
    # a failed embed; the chunks simply won't be recreated on error.
    await db.execute(
        delete(Chunk).where(Chunk.subject_type == subject_type, Chunk.subject_id == obj.id)
    )
    text = render_subject(subject_type, obj)
    pieces = chunk_text(text)
    if not pieces:
        return
    try:
        for idx, piece in enumerate(pieces):
            embedding = await embed_text(piece)
            db.add(
                Chunk(
                    subject_type=subject_type, subject_id=obj.id, chunk_index=idx,
                    content=piece, embedding=embedding,
                )
            )
        await db.flush()
    except Exception:
        _logger.exception(
            "Failed to index %s %s — write will still commit, chunks skipped",
            subject_type, obj.id,
        )


async def deindex_subject(db: AsyncSession, subject_type: str, subject_id: uuid.UUID) -> None:
    await db.execute(
        delete(Chunk).where(Chunk.subject_type == subject_type, Chunk.subject_id == subject_id)
    )
    await db.flush()


async def enqueue_index(
    db: AsyncSession, subject_type: str, obj: Any, op: str = "upsert"
) -> None:
    """Schedule (or perform) search indexing for an entity.

    When ``settings.async_indexing`` is enabled the work is deferred to the
    transactional outbox and drained by the worker. Otherwise it runs inline in
    the same transaction (the historical behavior the test suite relies on).
    """
    if settings.async_indexing:
        await enqueue_event(
            db, INDEX_AGGREGATE, obj.id, op, {"subject_type": subject_type}
        )
        return
    await index_subject(db, subject_type, obj)


async def enqueue_deindex(
    db: AsyncSession, subject_type: str, subject_id: uuid.UUID
) -> None:
    """Schedule (or perform) removal of an entity's chunks."""
    if settings.async_indexing:
        await enqueue_event(
            db, INDEX_AGGREGATE, subject_id, "delete", {"subject_type": subject_type}
        )
        return
    await deindex_subject(db, subject_type, subject_id)
