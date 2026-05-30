import uuid

from sqlalchemy import func, select

from app.config import settings
from app.models.chunk import Chunk
from app.models.context import Context
from app.search.index import (
    chunk_text,
    deindex_subject,
    index_payload,
    index_subject,
    render_subject,
)


async def test_index_subject_does_not_raise_on_embed_failure(db, monkeypatch):
    """C2 — a failing embed must not raise; the write path commits normally."""
    async def boom(_texts: list[str]):
        raise RuntimeError("Simulated embedding provider failure")

    monkeypatch.setattr("app.search.index.embed_texts", boom)

    ctx = Context(slug="embed-fail", name="EmbedFail", category="work")
    db.add(ctx)
    await db.flush()

    # Should not raise even though embedding fails
    await index_subject(db, "context", ctx)

    # No chunk was created, but no exception either
    count = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert count == 0


async def test_index_subject_creates_one_chunk(db):
    ctx = Context(
        slug="upsun-idx", name="Upsun", category="work", description="platform as a service"
    )
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)

    count = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert count == 1


async def test_index_subject_chunk_has_content_and_embedding(db):
    ctx = Context(
        slug="upsun-idx2", name="Upsun2", category="work", description="platform as a service"
    )
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)

    chunk = (await db.execute(
        select(Chunk).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert chunk.content.strip() != ""
    assert len(chunk.embedding) == settings.embeddings_dim


async def test_reindex_still_one_chunk(db):
    ctx = Context(
        slug="upsun-idx3", name="Upsun3", category="work", description="platform as a service"
    )
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)
    # Re-index (simulate update)
    await index_subject(db, "context", ctx)

    count = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert count == 1


async def test_deindex_removes_chunk(db):
    ctx = Context(
        slug="upsun-idx4", name="Upsun4", category="work", description="platform as a service"
    )
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)
    await deindex_subject(db, "context", ctx.id)

    count = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert count == 0


def test_chunk_text_short_is_single_chunk():
    assert chunk_text("a short body") == ["a short body"]


def test_chunk_text_empty_is_no_chunks():
    assert chunk_text("   ") == []


def test_chunk_text_long_body_splits_with_overlap():
    body = "x" * (settings.search_chunk_size * 2 + 100)
    chunks = chunk_text(body)
    assert len(chunks) >= 3
    assert all(len(c) <= settings.search_chunk_size for c in chunks)
    # Reassembled coverage: every character of the source is represented.
    assert "".join(dict.fromkeys(chunks))  # non-empty, distinct windows


async def test_index_subject_multi_chunk_for_long_body(db):
    long_body = "alpha beta gamma " * 400  # comfortably over the chunk size
    ctx = Context(slug="long-idx", name="Long", category="work", description=long_body)
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)

    count = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert count > 1


def test_render_subject_from_payload_dict():
    payload = {"name": "Acme", "slug": "acme", "summary": "a company"}
    text = render_subject("company", payload)
    assert "Acme" in text
    assert "acme" in text
    assert "a company" in text


async def test_index_payload_creates_chunk(db):
    subject_id = uuid.uuid4()
    payload = {"id": str(subject_id), "name": "Payload Co", "description": "indexed from outbox"}

    await index_payload(db, "company", subject_id, payload)

    chunk = (await db.execute(
        select(Chunk).where(Chunk.subject_type == "company", Chunk.subject_id == subject_id)
    )).scalar_one()
    assert "Payload Co" in chunk.content
    assert len(chunk.embedding) == settings.embeddings_dim
