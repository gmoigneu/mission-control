"""run_agent loads the DB persona and passes the composed system to complete()."""
import pytest

import app.agent.agent as agent_mod
from app.agent.agent import run_agent
from app.agent.llm import LLMTurn
from app.agent.persona_store import DEFAULT_PERSONA, SURFACE_MECHANICS, upsert_persona


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_uses_db_persona(db, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_complete(messages, tools, system, *, db=None):  # noqa: ANN001, ARG001
        captured["system"] = system
        return LLMTurn(text="ok")

    monkeypatch.setattr(agent_mod, "complete", fake_complete)

    await upsert_persona(db, name="Nova", role="chief of staff", enabled=True)
    await run_agent(db, "chat", "hello")

    assert "You are Nova, chief of staff." in captured["system"]
    # surface mechanics always appended after the SOUL
    assert SURFACE_MECHANICS["chat"] in captured["system"]


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_falls_back_to_default(db, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_complete(messages, tools, system, *, db=None):  # noqa: ANN001, ARG001
        captured["system"] = system
        return LLMTurn(text="ok")

    monkeypatch.setattr(agent_mod, "complete", fake_complete)

    # No persona row → default
    await run_agent(db, "chat", "hello")

    assert DEFAULT_PERSONA.name in captured["system"]
    assert SURFACE_MECHANICS["chat"] in captured["system"]


@pytest.mark.asyncio(loop_scope="session")
async def test_run_agent_disabled_persona_uses_default(db, monkeypatch):
    captured: dict[str, str] = {}

    async def fake_complete(messages, tools, system, *, db=None):  # noqa: ANN001, ARG001
        captured["system"] = system
        return LLMTurn(text="ok")

    monkeypatch.setattr(agent_mod, "complete", fake_complete)

    await upsert_persona(db, name="Nova", enabled=False)
    await run_agent(db, "chat", "hello")

    assert "Nova" not in captured["system"]
    assert DEFAULT_PERSONA.name in captured["system"]


def test_chat_mechanics_include_daily_checkin_instruction():
    assert "set_daily_checkin" in SURFACE_MECHANICS["chat"]
    assert "mood" in SURFACE_MECHANICS["chat"]
    assert "productivity" in SURFACE_MECHANICS["chat"]
