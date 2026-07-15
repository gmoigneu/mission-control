"""Integration tests for /agent/chat, /agent/capture, and /agent/runs/{id}/revert."""

import uuid

import pytest
from fastapi import HTTPException, status
from sqlalchemy import select

from app.api.agent import (
    CHAT_MESSAGE_TOO_LONG_DETAIL,
    MAX_CHAT_MESSAGE_CHARS,
    ChatRequest,
    agent_chat,
)
from app.models.capture import Capture
from app.models.context import Context
from app.models.inbox_item import InboxItem
from app.models.task import Task
from tests.helpers import login


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_capture_creates_context(client, db):
    """POST /agent/capture creates a Context and returns agent_run_id + writes."""
    await login(client, db, email="agent-cap@example.com", password="pw")

    resp = await client.post(
        "/agent/capture",
        json={"text": "create a context Marketing", "auto_apply": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "agent_run_id" in body
    assert "writes" in body
    assert isinstance(body["writes"], list)
    assert body["capture"]["raw_text"] == "create a context Marketing"

    # A Context named Marketing should now exist
    stmt = select(Context).where(Context.slug == "marketing")
    ctx = (await db.execute(stmt)).scalar_one_or_none()
    assert ctx is not None, "Expected a Context with slug='marketing' to be created"


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_capture_previews_task_then_applies(client, db):
    await login(client, db, email="capture-preview@example.com", password="pw")

    resp = await client.post(
        "/agent/capture",
        json={"text": "Create a task to call Sarah tomorrow", "source_surface": "cmd_k"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["capture"]["status"] == "previewed"
    assert body["result"]["proposed_actions"][0]["entity_type"] == "task"

    assert list((await db.execute(select(Task))).scalars().all()) == []

    apply_resp = await client.post(f"/agent/captures/{body['capture']['id']}/apply", json={})
    assert apply_resp.status_code == 200, apply_resp.text
    applied = apply_resp.json()
    assert applied["capture"]["status"] == "applied"
    assert any(w["entity_type"] == "task" for w in applied["writes"])

    tasks = list((await db.execute(select(Task))).scalars().all())
    assert len(tasks) == 1
    assert tasks[0].source == f"capture:{body['capture']['id']}"


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_capture_ambiguous_text_falls_back_to_inbox(client, db):
    await login(client, db, email="capture-inbox@example.com", password="pw")

    resp = await client.post(
        "/agent/capture",
        json={"text": "Sarah prefers async updates", "source_surface": "cmd_k"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["capture"]["status"] == "inboxed"
    assert body["capture"]["inbox_item_id"] is not None

    capture = await db.get(Capture, body["capture"]["id"])
    item = await db.get(InboxItem, body["capture"]["inbox_item_id"])
    assert capture is not None
    assert item is not None
    assert item.capture_id == capture.id
    assert item.body == "Sarah prefers async updates"
    assert item.triage_reason


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_chat_creates_task(client, db):
    """POST /agent/chat creates a Task and returns a non-empty reply."""
    await login(client, db, email="agent-chat@example.com", password="pw")

    resp = await client.post("/agent/chat", json={"message": "create a task to ship the release"})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "agent_run_id" in body
    assert "reply" in body
    assert len(body["reply"]) > 0

    # At least one task should exist matching our request
    stmt = select(Task)
    tasks = list((await db.execute(stmt)).scalars().all())
    assert len(tasks) >= 1


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_chat_rejects_oversized_message_before_run():
    payload = ChatRequest(message="x" * (MAX_CHAT_MESSAGE_CHARS + 1))

    with pytest.raises(HTTPException) as exc:
        await agent_chat(payload, user=None, db=None)  # type: ignore[arg-type]

    assert exc.value.status_code == status.HTTP_413_CONTENT_TOO_LARGE
    assert exc.value.detail == CHAT_MESSAGE_TOO_LONG_DETAIL


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_run_revert(client, db):
    """Capture creates an entity; revert deletes it and entity is 404."""
    await login(client, db, email="agent-rev@example.com", password="pw")

    # Capture a unique context
    unique_slug = f"revert-test-{uuid.uuid4().hex[:8]}"
    resp = await client.post(
        "/agent/capture",
        json={"text": f"create a context {unique_slug}", "auto_apply": True},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    run_id = body["agent_run_id"]

    # Confirm it was created
    stmt = select(Context).where(Context.slug == unique_slug)
    ctx = (await db.execute(stmt)).scalar_one_or_none()
    assert ctx is not None, f"Expected context {unique_slug!r} to exist before revert"
    ctx_id = ctx.id

    # Revert the run
    revert_resp = await client.post(f"/agent/runs/{run_id}/revert")
    assert revert_resp.status_code == 200, revert_resp.text
    revert_body = revert_resp.json()
    assert revert_body["reverted"] >= 1

    # Entity should be gone
    db.expire_all()
    deleted = await db.get(Context, ctx_id)
    assert deleted is None, "Expected context to be deleted after revert"


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_revert_unknown_run_returns_404(client, db):
    """Reverting a non-existent run_id returns 404."""
    await login(client, db, email="agent-404@example.com", password="pw")

    fake_id = uuid.uuid4()
    resp = await client.post(f"/agent/runs/{fake_id}/revert")
    assert resp.status_code == 404
