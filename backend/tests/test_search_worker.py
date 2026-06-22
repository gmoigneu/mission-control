"""Tests for the search outbox worker (drains the 'search' channel into chunks)."""
import uuid

from sqlalchemy import func, select

from app.models.chunk import Chunk
from app.models.context import Context
from app.models.outbox import CHANNEL_GRAPH, CHANNEL_SEARCH, OutboxEvent
from app.schemas.context import ContextCreate
from app.schemas.knowledge import KnowledgeCreate
from app.search.worker import process_search_outbox
from app.services.context import create_context, delete_context
from app.services.knowledge import create_knowledge


async def test_search_worker_indexes_created_entity(db):
    """A create emits a search event the worker turns into a chunk."""
    data = ContextCreate(
        slug=f"sw-{uuid.uuid4().hex[:6]}", name="Worker Indexed", category="work"
    )
    ctx = await create_context(db, data)
    await db.flush()

    # Nothing indexed inline.
    pre = (await db.execute(
        select(func.count()).where(Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert pre == 0

    processed = await process_search_outbox(db)
    assert processed >= 1

    post = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert post == 1


async def test_search_worker_indexes_newer_entity_types_without_inline_chunks(db):
    note = await create_knowledge(
        db,
        KnowledgeCreate(
            slug=f"knowledge-{uuid.uuid4().hex[:6]}",
            title="Worker Indexed Knowledge",
            body="Semantic worker coverage for newer entities",
        ),
    )
    await db.flush()

    pre = (
        await db.execute(select(func.count()).where(Chunk.subject_id == note.id))
    ).scalar_one()
    assert pre == 0

    processed = await process_search_outbox(db)
    assert processed >= 1

    chunk = (
        await db.execute(
            select(Chunk).where(
                Chunk.subject_type == "knowledge",
                Chunk.subject_id == note.id,
            )
        )
    ).scalar_one()
    assert "Worker Indexed Knowledge" in chunk.content


async def test_search_worker_deindexes_on_delete(db):
    data = ContextCreate(slug=f"sw-{uuid.uuid4().hex[:6]}", name="To Delete", category="work")
    ctx = await create_context(db, data)
    ctx_id = ctx.id
    await db.flush()
    await process_search_outbox(db)

    indexed = (await db.execute(
        select(func.count()).where(Chunk.subject_id == ctx_id)
    )).scalar_one()
    assert indexed == 1

    await delete_context(db, ctx)
    await db.flush()
    await process_search_outbox(db)

    remaining = (await db.execute(
        select(func.count()).where(Chunk.subject_id == ctx_id)
    )).scalar_one()
    assert remaining == 0


async def test_search_worker_marks_processed_and_skips_graph_channel(db):
    data = ContextCreate(slug=f"sw-{uuid.uuid4().hex[:6]}", name="Channels", category="work")
    ctx = await create_context(db, data)
    await db.flush()

    await process_search_outbox(db)

    rows = (await db.execute(
        select(OutboxEvent).where(OutboxEvent.aggregate_id == ctx.id)
    )).scalars().all()
    by_channel = {r.channel: r for r in rows}
    # Search event consumed, graph event left for the graph worker.
    assert by_channel[CHANNEL_SEARCH].processed_at is not None
    assert by_channel[CHANNEL_GRAPH].processed_at is None

    # Re-running does no further work.
    assert await process_search_outbox(db) == 0


async def test_search_worker_ignores_non_indexable_aggregate(db):
    """Edge-only aggregates (e.g. entity_link) have no chunk; the worker no-ops."""
    link_id = uuid.uuid4()
    db.add(
        OutboxEvent(
            channel=CHANNEL_SEARCH,
            aggregate_type="entity_link",
            aggregate_id=link_id,
            op="upsert",
            payload={"id": str(link_id), "from_type": "person", "to_type": "company"},
        )
    )
    await db.flush()

    processed = await process_search_outbox(db)
    assert processed == 1  # event drained...

    count = (await db.execute(
        select(func.count()).where(Chunk.subject_id == link_id)
    )).scalar_one()
    assert count == 0  # ...but no chunk written


async def test_search_worker_chunk_content_matches_entity(db):
    ctx = Context(
        slug=f"sw-{uuid.uuid4().hex[:6]}",
        name="Searchable Name",
        category="work",
        description="a distinctive description",
    )
    db.add(ctx)
    await db.flush()
    db.add(
        OutboxEvent(
            channel=CHANNEL_SEARCH,
            aggregate_type="context",
            aggregate_id=ctx.id,
            op="upsert",
            payload={
                "id": str(ctx.id),
                "name": "Searchable Name",
                "slug": ctx.slug,
                "description": "a distinctive description",
            },
        )
    )
    await db.flush()

    await process_search_outbox(db)

    chunk = (await db.execute(
        select(Chunk).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert "Searchable Name" in chunk.content
    assert "a distinctive description" in chunk.content
