import pytest
from sqlalchemy import select

from app.models.chunk import Chunk
from app.models.context import Context
from app.models.outbox import OutboxEvent, OutboxStatus
from app.outbox.service import enqueue_event
from app.search.index import INDEX_AGGREGATE, CHUNK_SIZE
from app.search.worker import drain_once


@pytest.mark.asyncio
async def test_drain_indexes_entity(db_session):
    ctx = Context(name="IndexMe", summary="hello world")
    db_session.add(ctx)
    await db_session.flush()
    await enqueue_event(
        db_session, INDEX_AGGREGATE, ctx.id, "upsert", {"subject_type": "context"}
    )
    await db_session.commit()

    processed = await drain_once(db_session)
    assert processed >= 1

    events = list(
        (
            await db_session.execute(
                select(OutboxEvent).where(OutboxEvent.aggregate_type == INDEX_AGGREGATE)
            )
        ).scalars()
    )
    assert all(e.status == OutboxStatus.done for e in events)

    chunks = list(
        (
            await db_session.execute(
                select(Chunk).where(
                    Chunk.subject_type == "context", Chunk.subject_id == ctx.id
                )
            )
        ).scalars()
    )
    assert len(chunks) == 1


@pytest.mark.asyncio
async def test_drain_multi_chunk(db_session):
    ctx = Context(name="Long", summary="word " * (CHUNK_SIZE // 2))
    db_session.add(ctx)
    await db_session.flush()
    await enqueue_event(
        db_session, INDEX_AGGREGATE, ctx.id, "upsert", {"subject_type": "context"}
    )
    await db_session.commit()

    await drain_once(db_session)

    chunks = list(
        (
            await db_session.execute(
                select(Chunk).where(
                    Chunk.subject_type == "context", Chunk.subject_id == ctx.id
                )
            )
        ).scalars()
    )
    assert len(chunks) >= 2


@pytest.mark.asyncio
async def test_drain_delete_removes_chunks(db_session):
    ctx = Context(name="Gone", summary="bye")
    db_session.add(ctx)
    await db_session.flush()
    # Seed an existing chunk to be removed by the delete event.
    db_session.add(
        Chunk(
            subject_type="context",
            subject_id=ctx.id,
            chunk_index=0,
            content="bye",
            embedding=[0.0] * 1536,
        )
    )
    await db_session.flush()
    await enqueue_event(
        db_session, INDEX_AGGREGATE, ctx.id, "delete", {"subject_type": "context"}
    )
    await db_session.commit()

    await drain_once(db_session)

    chunks = list(
        (
            await db_session.execute(
                select(Chunk).where(
                    Chunk.subject_type == "context", Chunk.subject_id == ctx.id
                )
            )
        ).scalars()
    )
    assert len(chunks) == 0
