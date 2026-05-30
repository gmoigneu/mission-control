"""Unit tests for the run_agent() agent loop."""
import uuid

import pytest
from sqlalchemy import select

from app.agent.agent import run_agent
from app.models.agent_run import AgentRun
from app.models.audit import AuditLog
from app.models.task import Task


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_capture_creates_task(db):
    """run_agent capture: creates a task, returns AgentResult with writes and ok status."""
    result = await run_agent(db, "capture", "create a task to email Bob")
    await db.flush()

    # AgentResult shape
    assert isinstance(result.agent_run_id, uuid.UUID)
    assert isinstance(result.reply, str)
    assert len(result.reply) > 0

    # writes contains a task create entry
    task_writes = [
        w for w in result.writes if w["action"] == "create" and w["entity_type"] == "task"
    ]
    assert len(task_writes) >= 1, f"Expected task write, got: {result.writes}"

    # Task exists in DB
    task_id = uuid.UUID(task_writes[0]["entity_id"])
    task = await db.get(Task, task_id)
    assert task is not None

    # AgentRun row has ok status and non-empty transcript
    run = await db.get(AgentRun, result.agent_run_id)
    assert run is not None
    assert run.status == "ok"
    assert run.transcript is not None
    assert len(run.transcript) > 0

    # Audit carries the run id
    stmt = select(AuditLog).where(
        AuditLog.entity_type == "task",
        AuditLog.entity_id == task_id,
        AuditLog.action == "create",
    )
    audit_rows = list((await db.execute(stmt)).scalars().all())
    assert len(audit_rows) >= 1
    assert audit_rows[0].agent_run_id == result.agent_run_id


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_chat_returns_reply(db):
    """run_agent chat: returns a non-empty reply."""
    result = await run_agent(db, "chat", "create a task to ship the release")
    await db.flush()

    assert isinstance(result.reply, str)
    assert len(result.reply) > 0
    assert isinstance(result.agent_run_id, uuid.UUID)
