import uuid

import pytest
from sqlalchemy import select

from app.models.chunk import Chunk
from app.models.context import Context
from app.search.index import (
    CHUNK_SIZE,
    chunk_text,
    deindex_subject,
    index_subject,
)


@pytest.mark.asyncio
async def test_index_subject_creates_chunk(db_session):
    ctx = Context(name="Alpha", summary="A test context")
    db_session.add(ctx)
    await db_session.flush()
    await index_subject(db_session, "context", ctx)
    result = await db_session.execute(
        select(Chunk).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )
    chunks = list(result.scalars().all())
    assert len(chunks) == 1
    assert chunks[0].chunk_index == 0
    assert chunks[0].content


@pytest.mark.asyncio
async def test_deindex_subject_removes_chunks(db_session):
    ctx = Context(name="Alpha", summary="A test context")
    db_session.add(ctx)
    await db_session.flush()
    await index_subject(db_session, "context", ctx)
    await deindex_subject(db_session, "context", ctx.id)
    result = await db_session.execute(
        select(Chunk).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )
    chunks = list(result.scalars().all())
    assert len(chunks) == 0


def test_chunk_text_short_is_single():
    assert chunk_text("hello world") == ["hello world"]


def test_chunk_text_empty():
    assert chunk_text("   ") == []


def test_chunk_text_long_splits():
    text = "a" * (CHUNK_SIZE * 2 + 50)
    pieces = chunk_text(text)
    assert len(pieces) == 3
    assert all(len(p) <= CHUNK_SIZE for p in pieces)
    assert "".join(pieces) == text


@pytest.mark.asyncio
async def test_index_subject_multi_chunk(db_session):
    long_summary = "word " * (CHUNK_SIZE // 2)
    ctx = Context(name="Long", summary=long_summary)
    db_session.add(ctx)
    await db_session.flush()
    await index_subject(db_session, "context", ctx)
    result = await db_session.execute(
        select(Chunk)
        .where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
        .order_by(Chunk.chunk_index)
    )
    chunks = list(result.scalars().all())
    assert len(chunks) >= 2
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


@pytest.mark.asyncio
async def test_index_subject_reindex_replaces_chunks(db_session):
    long_summary = "word " * (CHUNK_SIZE // 2)
    ctx = Context(name="Replace", summary=long_summary)
    db_session.add(ctx)
    await db_session.flush()
    await index_subject(db_session, "context", ctx)
    # Re-index with short content: stale multi-chunk rows must be cleared.
    ctx.summary = "short"
    await index_subject(db_session, "context", ctx)
    result = await db_session.execute(
        select(Chunk).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )
    chunks = list(result.scalars().all())
    assert len(chunks) == 1
    assert chunks[0].chunk_index == 0
