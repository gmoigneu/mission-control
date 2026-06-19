"""Chat-thread persistence + multi-turn context replay.

The regression these guard against: previously every /agent/chat turn was a fresh
conversation with no memory of prior turns, so Aya kept losing context. Now the
backend seeds the whole thread so far into the agent loop.
"""
import uuid

import pytest

from app.agent import agent as agent_module
from app.agent.agent import run_agent
from app.agent.llm import LLMTurn
from app.models.agent_run import AgentRun
from tests.helpers import login


def _fake_complete_factory(seen: list):
    """A stub LLM that records the messages it sees and replies with text."""

    async def fake_complete(messages, tools, system="", db=None):  # noqa: ARG001
        seen.append(list(messages))  # snapshot — run_agent mutates the live list
        return LLMTurn(text=f"reply-{len(seen)}", tool_calls=[])

    return fake_complete


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_seeds_history_without_duplicating(db, monkeypatch):
    """run_agent feeds prior turns to the LLM but stores only the new turn."""
    seen: list = []
    monkeypatch.setattr(agent_module, "complete", _fake_complete_factory(seen))

    history = [
        {"role": "user", "content": "remember my name is G"},
        {"role": "assistant", "content": "Got it, G."},
    ]
    result = await run_agent(db, "chat", "what's my name?", history=history)
    await db.flush()

    # The LLM saw the full conversation: seeded history + the new user turn.
    assert seen, "complete() was never called"
    sent = seen[0]
    assert len(sent) == 3
    assert sent[0]["content"] == "remember my name is G"
    assert sent[-1]["content"] == "what's my name?"

    # But the stored transcript is only THIS turn — no duplicated history.
    run = await db.get(AgentRun, result.agent_run_id)
    assert run.transcript[0] == {"role": "user", "content": "what's my name?"}
    assert run.transcript[-1] == {"role": "assistant", "content": "reply-1"}
    assert all(m.get("content") != "remember my name is G" for m in run.transcript)
    assert run.reply == "reply-1"


@pytest.mark.asyncio(loop_scope="session")
async def test_chat_thread_accumulates_and_replays(client, db, monkeypatch):
    """Two turns on one thread: the second LLM call gets the first turn as context."""
    seen: list = []
    monkeypatch.setattr(agent_module, "complete", _fake_complete_factory(seen))
    await login(client, db, email="thread@example.com", password="pw")

    r1 = await client.post("/agent/chat", json={"message": "first message"})
    assert r1.status_code == 200, r1.text
    conv_id = r1.json()["conversation_id"]
    assert conv_id

    r2 = await client.post(
        "/agent/chat", json={"message": "second message", "conversation_id": conv_id}
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["conversation_id"] == conv_id

    # The second turn's LLM call carried the first turn (user + assistant).
    second_sent = seen[-1]
    contents = [m.get("content") for m in second_sent]
    assert "first message" in contents
    assert "reply-1" in contents
    assert second_sent[-1]["content"] == "second message"

    # GET current rebuilds both turns as UI bubbles.
    cur = await client.get("/agent/conversation/current")
    assert cur.status_code == 200, cur.text
    body = cur.json()
    assert body["id"] == conv_id
    texts = [(m["role"], m["text"]) for m in body["messages"]]
    assert texts == [
        ("user", "first message"),
        ("assistant", "reply-1"),
        ("user", "second message"),
        ("assistant", "reply-2"),
    ]
    # Assistant bubbles carry their run id (for Undo) and a writes list.
    for m in body["messages"]:
        if m["role"] == "assistant":
            assert m["run_id"]
            assert isinstance(m["writes"], list)


@pytest.mark.asyncio(loop_scope="session")
async def test_new_conversation_rotates_current(client, db, monkeypatch):
    """/conversation/new starts a fresh thread that becomes current."""
    monkeypatch.setattr(agent_module, "complete", _fake_complete_factory([]))
    await login(client, db, email="newconv@example.com", password="pw")

    r1 = await client.post("/agent/chat", json={"message": "old thread msg"})
    old_id = r1.json()["conversation_id"]

    rn = await client.post("/agent/conversation/new")
    assert rn.status_code == 200, rn.text
    new_id = rn.json()["id"]
    assert new_id != old_id
    assert rn.json()["messages"] == []

    # Current is now the fresh, empty thread.
    cur = await client.get("/agent/conversation/current")
    assert cur.json()["id"] == new_id
    assert cur.json()["messages"] == []

    # A chat with no conversation_id targets the new current thread.
    r2 = await client.post("/agent/chat", json={"message": "new thread msg"})
    assert r2.json()["conversation_id"] == new_id


@pytest.mark.asyncio(loop_scope="session")
async def test_capture_run_has_no_conversation(client, db):
    """Capture stays one-shot — its run is not linked to any thread."""
    await login(client, db, email="capnoconv@example.com", password="pw")
    unique = f"capnoconv-{uuid.uuid4().hex[:8]}"
    resp = await client.post("/agent/capture", json={"text": f"create a context {unique}"})
    assert resp.status_code == 200, resp.text
    run = await db.get(AgentRun, uuid.UUID(resp.json()["agent_run_id"]))
    assert run.conversation_id is None
