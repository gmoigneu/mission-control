"""Tests for agent tool handlers and agent_run_id contextvar wiring."""
import uuid

import pytest
from sqlalchemy import select

from app.agent.context import agent_run_id_var
from app.agent.tools import TOOL_HANDLERS
from app.models.audit import AuditLog
from app.models.context import Context


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
