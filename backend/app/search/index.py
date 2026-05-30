import logging
import uuid
from typing import Any

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chunk import Chunk
from app.search.embedder import embed_texts

_logger = logging.getLogger(__name__)

# Entity types that get indexed for semantic search. Edge-only aggregates
# (relationship, task_link, entity_link) live in the graph, not the index.
INDEXABLE_TYPES = frozenset(
    {"context", "project", "company", "person", "task", "observation"}
)

# Fields that make up the searchable text, in render order.
_RENDER_FIELDS = (
    "name", "title", "slug", "role", "summary", "purpose", "body", "outcome",
    "description", "notes", "type", "kind", "category", "status", "email",
)

# Long bodies are split into several chunks so a single oversized entity does
# not collapse into one diluted embedding. Sizes are in characters (the fake
# embedder is token-free; openai's limit is far larger than these windows).
_CHUNK_SIZE = settings.search_chunk_size
_CHUNK_OVERLAP = settings.search_chunk_overlap


def _field_value(source: Any, attr: str) -> Any:
    """Read a render field from either a mapped object or an outbox payload dict."""
    if isinstance(source, dict):
        return source.get(attr)
    return getattr(source, attr, None)


def render_subject(subject_type: str, source: Any) -> str:
    """Render an entity (ORM object or outbox payload dict) to searchable text."""
    parts: list[str] = []
    for attr in _RENDER_FIELDS:
        val = _field_value(source, attr)
        if val:
            parts.append(str(val))
    return " — ".join(parts)


def chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    """Split *text* into overlapping windows so long bodies index as many chunks."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    step = max(1, size - overlap)
    chunks: list[str] = []
    for start in range(0, len(text), step):
        chunk = text[start:start + size].strip()
        if chunk:
            chunks.append(chunk)
        if start + size >= len(text):
            break
    return chunks


async def _write_chunks(
    db: AsyncSession, subject_type: str, subject_id: uuid.UUID, text: str
) -> None:
    """Replace all chunks for a subject with freshly embedded multi-chunk rows.

    Stale chunks are deleted unconditionally so the index never blocks on a
    failed embed; on embed error the chunks are simply not recreated.
    """
    await db.execute(
        delete(Chunk).where(Chunk.subject_type == subject_type, Chunk.subject_id == subject_id)
    )
    chunks = chunk_text(text)
    if not chunks:
        return
    try:
        embeddings = await embed_texts(chunks)
    except Exception:
        _logger.exception(
            "Failed to index %s %s — chunks skipped", subject_type, subject_id
        )
        return
    for idx, (content, embedding) in enumerate(zip(chunks, embeddings, strict=True)):
        db.add(
            Chunk(
                subject_type=subject_type, subject_id=subject_id, chunk_index=idx,
                content=content, embedding=embedding,
            )
        )
    await db.flush()


async def index_subject(db: AsyncSession, subject_type: str, obj: Any) -> None:
    """Index a mapped object (used by /admin/reindex)."""
    await _write_chunks(db, subject_type, obj.id, render_subject(subject_type, obj))


async def index_payload(
    db: AsyncSession, subject_type: str, subject_id: uuid.UUID, payload: dict
) -> None:
    """Index from an outbox payload (used by the search worker)."""
    await _write_chunks(db, subject_type, subject_id, render_subject(subject_type, payload))


async def deindex_subject(db: AsyncSession, subject_type: str, subject_id: uuid.UUID) -> None:
    await db.execute(
        delete(Chunk).where(Chunk.subject_type == subject_type, Chunk.subject_id == subject_id)
    )
    await db.flush()
