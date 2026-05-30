"""Tests for the transactional outbox emitted by the audit hook."""
import uuid

from sqlalchemy import select

from app.models.outbox import CHANNEL_GRAPH, CHANNEL_SEARCH, OutboxEvent
from app.schemas.context import ContextCreate
from app.services.context import create_context, delete_context


async def test_outbox_create_context_fans_out_to_both_channels(db):
    """Creating a context emits one upsert event per consumer channel."""
    data = ContextCreate(slug=f"test-ctx-{uuid.uuid4().hex[:6]}", name="Test Context")
    ctx = await create_context(db, data)
    await db.flush()

    result = await db.execute(
        select(OutboxEvent)
        .where(OutboxEvent.aggregate_type == "context")
        .where(OutboxEvent.aggregate_id == ctx.id)
        .order_by(OutboxEvent.created_at)
    )
    rows = result.scalars().all()

    assert len(rows) == 2, f"Expected 2 outbox rows (graph+search), got {len(rows)}"
    assert {r.channel for r in rows} == {CHANNEL_GRAPH, CHANNEL_SEARCH}
    for row in rows:
        assert row.op == "upsert"
        assert row.processed_at is None
        assert row.payload is not None
        assert row.payload.get("slug") == data.slug


async def test_outbox_delete_context(db):
    """Deleting a context adds a second OutboxEvent with op='delete'."""
    data = ContextCreate(slug=f"del-ctx-{uuid.uuid4().hex[:6]}", name="Delete Me")
    ctx = await create_context(db, data)
    ctx_id = ctx.id
    await db.flush()

    await delete_context(db, ctx)
    await db.flush()

    result = await db.execute(
        select(OutboxEvent)
        .where(OutboxEvent.aggregate_type == "context")
        .where(OutboxEvent.aggregate_id == ctx_id)
        .order_by(OutboxEvent.created_at)
    )
    rows = result.scalars().all()

    ops = [r.op for r in rows]
    assert "upsert" in ops, "Expected an upsert row"
    assert "delete" in ops, "Expected a delete row"

    delete_row = next(r for r in rows if r.op == "delete")
    assert delete_row.processed_at is None
    assert delete_row.payload is not None
    assert delete_row.payload.get("slug") == data.slug
