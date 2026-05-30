"""Tests for the transactional outbox emitted by the audit hook."""
import uuid

from sqlalchemy import select

from app.models.outbox import OutboxEvent
from app.schemas.context import ContextCreate
from app.services.context import create_context, delete_context


async def test_outbox_create_context(db):
    """Creating a context emits exactly one upsert OutboxEvent."""
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

    assert len(rows) == 1, f"Expected 1 outbox row, got {len(rows)}"
    row = rows[0]
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
