"""Tests for agent tool handlers and agent_run_id contextvar wiring."""
import uuid

import pytest
from sqlalchemy import select

from app.agent.context import agent_run_id_var
from app.agent.tools import TOOL_HANDLERS
from app.models.audit import AuditLog
from app.models.context import Context
from app.models.journal_entry import JournalEntry
from app.models.outbox import OutboxEvent
from app.models.relationship import Relationship


@pytest.mark.asyncio(loop_scope="session")
async def test_create_context_handler_and_audit_agent_run_id(db):
    """create_context handler writes the entity AND the AuditLog carries agent_run_id."""
    run_id = uuid.uuid4()
    token = agent_run_id_var.set(run_id)
    try:
        handler = TOOL_HANDLERS["create_context"]
        result = await handler(db, {"slug": "test-ctx-agent", "name": "Test Context Agent"})
        await db.flush()
    finally:
        agent_run_id_var.reset(token)

    # Entity was created
    assert "id" in result
    ctx_id = uuid.UUID(result["id"])
    ctx = await db.get(Context, ctx_id)
    assert ctx is not None
    assert ctx.slug == "test-ctx-agent"

    # AuditLog carries the agent_run_id
    stmt = select(AuditLog).where(
        AuditLog.entity_type == "context",
        AuditLog.entity_id == ctx_id,
        AuditLog.action == "create",
    )
    rows = list((await db.execute(stmt)).scalars().all())
    assert len(rows) >= 1
    assert rows[0].agent_run_id == run_id


@pytest.mark.asyncio(loop_scope="session")
async def test_create_task_handler(db):
    """create_task handler creates a task and returns id + title."""
    handler = TOOL_HANDLERS["create_task"]
    result = await handler(db, {"title": "Email Bob about the proposal"})
    await db.flush()
    assert "id" in result
    assert result["title"] == "Email Bob about the proposal"


@pytest.mark.asyncio(loop_scope="session")
async def test_add_relationship_handler_links_two_people_and_emits_graph_event(db):
    """add_relationship creates an edge row and a graph outbox event (→ KNOWS edge)."""
    create_person = TOOL_HANDLERS["create_person"]
    magalie = await create_person(db, {"slug": "magalie-rel", "name": "Magalie Rel"})
    david = await create_person(db, {"slug": "david-rel", "name": "David"})
    await db.flush()

    handler = TOOL_HANDLERS["add_relationship"]
    result = await handler(
        db,
        {"from_person_id": magalie["id"], "to_person_id": david["id"], "type": "partner"},
    )
    await db.flush()

    rel_id = uuid.UUID(result["id"])
    rel = await db.get(Relationship, rel_id)
    assert rel is not None
    assert str(rel.from_person_id) == magalie["id"]
    assert str(rel.to_person_id) == david["id"]
    assert rel.type == "partner"

    # A graph-channel outbox event was emitted so the worker projects a KNOWS edge.
    stmt = select(OutboxEvent).where(
        OutboxEvent.aggregate_type == "relationship",
        OutboxEvent.aggregate_id == rel_id,
        OutboxEvent.channel == "graph",
    )
    rows = list((await db.execute(stmt)).scalars().all())
    assert len(rows) == 1
    assert rows[0].op == "upsert"


@pytest.mark.asyncio(loop_scope="session")
async def test_journal_capture_handlers_are_idempotent_per_day(db):
    """get_or_create returns one entry per day; append_journal_log adds to its body."""
    get_or_create = TOOL_HANDLERS["get_or_create_journal_entry"]
    first = await get_or_create(db, {})
    await db.flush()
    second = await get_or_create(db, {})
    await db.flush()
    assert first["id"] == second["id"]

    append = TOOL_HANDLERS["append_journal_log"]
    await append(db, {"entry_id": first["id"], "text": "Had a barbecue with Magalie and David"})
    await db.flush()

    entry = await db.get(JournalEntry, uuid.UUID(first["id"]))
    assert entry is not None
    assert "barbecue" in entry.body


@pytest.mark.asyncio(loop_scope="session")
async def test_set_daily_checkin_handler_updates_journal_scores(db):
    handler = TOOL_HANDLERS["set_daily_checkin"]

    result = await handler(
        db,
        {"date": "2026-06-21", "mood": 4, "energy": 3, "productivity": 5},
    )
    await db.flush()

    entry = await db.get(JournalEntry, uuid.UUID(result["id"]))
    assert entry is not None
    assert entry.date.isoformat() == "2026-06-21"
    assert entry.mood == 4
    assert entry.energy == 3
    assert entry.productivity == 5

    patched = await handler(db, {"date": "2026-06-21", "energy": 2})
    await db.flush()
    assert patched["mood"] == 4
    assert patched["energy"] == 2
    assert patched["productivity"] == 5


@pytest.mark.asyncio(loop_scope="session")
async def test_find_person_handler(db):
    """find_person resolves an existing person by name without the search index."""
    await TOOL_HANDLERS["create_person"](db, {"slug": "zoe-finder", "name": "Zoe Finder"})
    await db.flush()
    res = await TOOL_HANDLERS["find_person"](db, {"query": "Zoe"})
    assert any(p["slug"] == "zoe-finder" for p in res["people"])


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_run_id_defaults_to_none_outside_agent(db):
    """Outside of an agent run the contextvar is None — existing behaviour unchanged."""
    from app.schemas.context import ContextCreate
    from app.services.context import create_context

    obj = await create_context(
        db, ContextCreate(slug="ctx-no-agent", name="No Agent"), surface="api"
    )
    await db.flush()

    stmt = select(AuditLog).where(
        AuditLog.entity_type == "context",
        AuditLog.entity_id == obj.id,
        AuditLog.action == "create",
    )
    rows = list((await db.execute(stmt)).scalars().all())
    assert len(rows) >= 1
    assert rows[0].agent_run_id is None
