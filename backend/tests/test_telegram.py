"""Telegram gateway: message chunking, webhook auth, allowlist, dedicated thread.

The agent's LLM call is stubbed (see _fake_complete) so these stay offline and
deterministic; the gateway logic, thread mapping, and webhook auth are real.
"""
import pytest
from sqlalchemy import select

from app.agent import agent as agent_module
from app.agent.llm import LLMTurn
from app.config import settings
from app.models.agent_run import AgentRun
from app.models.telegram_chat import TelegramChat
from app.models.user import AppUser
from app.security import hash_password
from app.telegram import client as tg_client
from app.telegram import gateway


def _fake_complete(reply: str = "hi from aya"):
    async def fake_complete(messages, tools, system="", db=None):  # noqa: ARG001
        return LLMTurn(text=reply, tool_calls=[])

    return fake_complete


def _message(chat_id: int, text: str | None = None, **extra: object) -> dict:
    message: dict = {"message_id": 7, "chat": {"id": chat_id, "type": "private"}}
    if text is not None:
        message["text"] = text
    message.update(extra)
    return {"update_id": 1, "message": message}


# ---------------------------------------------------------------------------
# client._chunk (pure)
# ---------------------------------------------------------------------------


def test_chunk_short_text_is_single_piece():
    assert tg_client._chunk("hello") == ["hello"]


def test_chunk_long_text_splits_under_limit_without_losing_content():
    text = "\n".join(f"line number {i}" for i in range(2000))  # well over 4096 chars
    pieces = tg_client._chunk(text)
    assert len(pieces) > 1
    assert all(len(p) <= tg_client.MAX_MESSAGE_LEN for p in pieces)
    # Only the newlines we split on are dropped; no other content is lost.
    assert "".join(pieces).replace("\n", "") == text.replace("\n", "")


# ---------------------------------------------------------------------------
# gateway.handle_update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio(loop_scope="session")
async def test_handle_update_runs_agent_and_creates_dedicated_thread(db, monkeypatch):
    monkeypatch.setattr(agent_module, "complete", _fake_complete("done"))
    monkeypatch.setattr(settings, "telegram_allowed_chat_ids", "555")
    monkeypatch.setattr(settings, "initial_user_email", None)
    user = AppUser(email="tg@example.com", password_hash=hash_password("pw"))
    db.add(user)
    await db.flush()

    reply = await gateway.handle_update(db, _message(555, "what's on my plate?"))
    assert reply == "done"

    chat = await db.get(TelegramChat, 555)
    assert chat is not None
    assert chat.user_id == user.id
    assert chat.conversation_id is not None

    runs = list(
        (await db.execute(select(AgentRun).where(AgentRun.surface == "telegram"))).scalars().all()
    )
    assert len(runs) == 1
    assert runs[0].conversation_id == chat.conversation_id


@pytest.mark.asyncio(loop_scope="session")
async def test_handle_update_ignores_non_allowlisted_chat(db, monkeypatch):
    monkeypatch.setattr(settings, "telegram_allowed_chat_ids", "555")
    reply = await gateway.handle_update(db, _message(999, "let me in"))
    assert reply is None
    assert await db.get(TelegramChat, 999) is None


@pytest.mark.asyncio(loop_scope="session")
async def test_new_command_rotates_to_a_fresh_thread(db, monkeypatch):
    monkeypatch.setattr(agent_module, "complete", _fake_complete("ok"))
    monkeypatch.setattr(settings, "telegram_allowed_chat_ids", "42")
    monkeypatch.setattr(settings, "initial_user_email", None)
    db.add(AppUser(email="rot@example.com", password_hash=hash_password("pw")))
    await db.flush()

    await gateway.handle_update(db, _message(42, "hi"))
    chat = await db.get(TelegramChat, 42)
    first_thread = chat.conversation_id
    assert first_thread is not None

    # chat is the identity-mapped row the gateway mutates, so its conversation_id
    # reflects the rotation (the caller commits it in production).
    reply = await gateway.handle_update(db, _message(42, "/new"))
    assert "new thread" in reply.lower()
    assert chat.conversation_id is not None
    assert chat.conversation_id != first_thread


@pytest.mark.asyncio(loop_scope="session")
async def test_non_text_message_is_acknowledged(db, monkeypatch):
    monkeypatch.setattr(settings, "telegram_allowed_chat_ids", "7")
    monkeypatch.setattr(settings, "initial_user_email", None)
    db.add(AppUser(email="nt@example.com", password_hash=hash_password("pw")))
    await db.flush()

    reply = await gateway.handle_update(db, _message(7, text=None, photo=[{"file_id": "x"}]))
    assert reply is not None
    assert "text" in reply.lower()


# ---------------------------------------------------------------------------
# POST /telegram/webhook
# ---------------------------------------------------------------------------


@pytest.mark.asyncio(loop_scope="session")
async def test_webhook_404_when_bot_not_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_token", None)
    resp = await client.post("/telegram/webhook", json={"update_id": 1})
    assert resp.status_code == 404


@pytest.mark.asyncio(loop_scope="session")
async def test_webhook_403_on_missing_or_wrong_secret(client, monkeypatch):
    monkeypatch.setattr(settings, "telegram_bot_token", "tok")
    monkeypatch.setattr(settings, "telegram_webhook_secret", "sekret")

    resp = await client.post("/telegram/webhook", json={"update_id": 1})
    assert resp.status_code == 403

    resp = await client.post(
        "/telegram/webhook",
        json={"update_id": 1},
        headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio(loop_scope="session")
async def test_webhook_acks_and_schedules_processing(client, monkeypatch):
    from app.api import telegram as telegram_api

    monkeypatch.setattr(settings, "telegram_bot_token", "tok")
    monkeypatch.setattr(settings, "telegram_webhook_secret", "sekret")
    received: list[dict] = []

    async def fake_process(update: dict) -> None:
        received.append(update)

    monkeypatch.setattr(telegram_api, "process_update", fake_process)

    resp = await client.post(
        "/telegram/webhook",
        json={"update_id": 99, "message": {"chat": {"id": 1}, "text": "hi"}},
        headers={"X-Telegram-Bot-Api-Secret-Token": "sekret"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert received and received[0]["update_id"] == 99
