"""Unit tests for the run_agent() agent loop."""
import logging
import uuid

import pytest
from sqlalchemy import select

from app.agent import agent as agent_module
from app.agent.agent import run_agent
from app.agent.llm import LLMTurn, ToolCall
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


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_logs_tool_failures_without_payload(db, monkeypatch, caplog):
    calls = 0

    async def fake_complete(messages, tools, system="", db=None):  # noqa: ARG001
        nonlocal calls
        calls += 1
        if calls == 1:
            return LLMTurn(
                text=None,
                tool_calls=[
                    ToolCall(
                        id="tool-call-1",
                        name="create_person",
                        input={"slug": "private-slug", "name": "Private Name"},
                    )
                ],
            )
        return LLMTurn(text="I found the problem.")

    async def failing_tool(db, name, args):  # noqa: ARG001
        raise ValueError("duplicate person")

    monkeypatch.setattr(agent_module, "complete", fake_complete)
    monkeypatch.setattr(agent_module, "invoke_tool", failing_tool)

    with caplog.at_level(logging.ERROR, logger=agent_module.__name__):
        result = await run_agent(db, "chat", "private user message")

    assert result.reply == "I found the problem."
    assert "Agent tool failed" in caplog.text
    assert f"run_id={result.agent_run_id}" in caplog.text
    assert "surface=chat" in caplog.text
    assert "tool=create_person" in caplog.text
    assert "error_type=ValueError" in caplog.text
    assert any(record.exc_info is not None for record in caplog.records)
    assert "private user message" not in caplog.text
    assert "private-slug" not in caplog.text
    assert "Private Name" not in caplog.text


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_logs_run_failures_without_user_input(db, monkeypatch, caplog):
    async def failing_complete(messages, tools, system="", db=None):  # noqa: ARG001
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(agent_module, "complete", failing_complete)

    with (
        caplog.at_level(logging.ERROR, logger=agent_module.__name__),
        pytest.raises(RuntimeError, match="provider unavailable"),
    ):
        await run_agent(db, "chat", "another private user message")

    assert "Agent run failed" in caplog.text
    assert "surface=chat" in caplog.text
    assert "error_type=RuntimeError" in caplog.text
    assert any(record.exc_info is not None for record in caplog.records)
    assert "another private user message" not in caplog.text


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_preserves_original_error_when_error_flush_fails(
    db, monkeypatch, caplog
):
    original_flush = db.flush
    flush_calls = 0

    async def failing_complete(messages, tools, system="", db=None):  # noqa: ARG001
        raise ValueError("original provider failure")

    async def flaky_flush(*args, **kwargs):
        nonlocal flush_calls
        flush_calls += 1
        if flush_calls == 1:
            return await original_flush(*args, **kwargs)
        raise RuntimeError("error status flush failed")

    monkeypatch.setattr(agent_module, "complete", failing_complete)
    monkeypatch.setattr(db, "flush", flaky_flush)

    with (
        caplog.at_level(logging.ERROR, logger=agent_module.__name__),
        pytest.raises(ValueError, match="original provider failure"),
    ):
        await run_agent(db, "chat", "private failure message")

    assert "Agent run failed" in caplog.text
    assert "Failed to persist agent run error" in caplog.text
    assert "error_type=RuntimeError" in caplog.text
    assert "private failure message" not in caplog.text
