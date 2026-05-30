"""Unit tests for persona storage + system-prompt composition."""
import pytest
from sqlalchemy import func, select

from app.agent.persona_store import (
    DEFAULT_PERSONA,
    MAX_INSTRUCTIONS,
    SURFACE_MECHANICS,
    compose_system,
    get_persona,
    upsert_persona,
)
from app.models.agent_persona import AgentPersona


@pytest.mark.asyncio(loop_scope="session")
async def test_get_returns_none_when_absent(db):
    assert await get_persona(db) is None


@pytest.mark.asyncio(loop_scope="session")
async def test_upsert_then_get_round_trip(db):
    await upsert_persona(db, name="Nova", role="copilot", tone="playful")
    persona = await get_persona(db)
    assert persona is not None
    assert persona.name == "Nova"
    assert persona.role == "copilot"
    assert persona.tone == "playful"


@pytest.mark.asyncio(loop_scope="session")
async def test_upsert_is_idempotent_single_row(db):
    await upsert_persona(db, name="One")
    await upsert_persona(db, name="Two")
    count = (await db.execute(select(func.count()).select_from(AgentPersona))).scalar_one()
    assert count == 1
    persona = await get_persona(db)
    assert persona.name == "Two"


@pytest.mark.asyncio(loop_scope="session")
async def test_instructions_trimmed_and_capped(db):
    long_body = "x" * (MAX_INSTRUCTIONS + 500)
    persona = await upsert_persona(db, instructions="  " + long_body + "  ")
    assert persona.instructions is not None
    assert len(persona.instructions) == MAX_INSTRUCTIONS


@pytest.mark.asyncio(loop_scope="session")
async def test_blank_instructions_normalize_to_none(db):
    persona = await upsert_persona(db, instructions="   ")
    assert persona.instructions is None


@pytest.mark.asyncio(loop_scope="session")
async def test_blank_name_falls_back_to_default(db):
    persona = await upsert_persona(db, name="   ")
    assert persona.name == DEFAULT_PERSONA.name


def test_compose_default_when_none():
    system = compose_system(None, "chat")
    assert "You are Aya" in system
    assert SURFACE_MECHANICS["chat"] in system


def test_compose_merges_soul_and_surface_mechanics():
    persona = AgentPersona(
        name="Nova",
        role="copilot",
        tone="playful",
        principles="Be helpful.",
        boundaries="No guessing.",
        instructions="Keep it short.",
        enabled=True,
    )
    chat = compose_system(persona, "chat")
    assert "You are Nova, copilot." in chat
    assert "playful" in chat
    assert "Be helpful." in chat
    assert "No guessing." in chat
    assert "Keep it short." in chat
    # The fixed per-surface mechanics are always appended after the SOUL.
    assert chat.endswith(SURFACE_MECHANICS["chat"])

    capture = compose_system(persona, "capture")
    assert capture.endswith(SURFACE_MECHANICS["capture"])


def test_compose_disabled_persona_uses_default():
    persona = AgentPersona(name="Nova", role="copilot", enabled=False)
    system = compose_system(persona, "chat")
    assert "You are Aya" in system
    assert "Nova" not in system


def test_compose_unknown_surface_falls_back_to_chat_mechanics():
    system = compose_system(None, "totally-unknown")
    assert SURFACE_MECHANICS["chat"] in system
