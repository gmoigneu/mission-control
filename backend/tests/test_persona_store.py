"""Unit tests for the SOUL / persona store and prompt composition."""
import pytest
from sqlalchemy import func, select

from app.agent.persona_store import (
    DEFAULT_PERSONA,
    MAX_INSTRUCTIONS_CHARS,
    SURFACE_MECHANICS,
    compose_system,
    get_persona,
    resolve_greeting,
    upsert_persona,
)
from app.models.agent_persona import AgentPersona


@pytest.mark.asyncio(loop_scope="session")
async def test_get_upsert_round_trip(db):
    assert await get_persona(db) is None

    persona = await upsert_persona(db, name="Nova", role="ops lead", tone="dry, precise")
    fetched = await get_persona(db)
    assert fetched is not None
    assert fetched.id == persona.id
    assert fetched.name == "Nova"
    assert fetched.role == "ops lead"
    assert fetched.tone == "dry, precise"


@pytest.mark.asyncio(loop_scope="session")
async def test_upsert_is_idempotent_single_row(db):
    await upsert_persona(db, name="One")
    await upsert_persona(db, name="Two")
    count = (await db.execute(select(func.count()).select_from(AgentPersona))).scalar_one()
    assert count == 1
    persona = await get_persona(db)
    assert persona.name == "Two"


@pytest.mark.asyncio(loop_scope="session")
async def test_blank_name_falls_back_to_default(db):
    persona = await upsert_persona(db, name="   ")
    assert persona.name == DEFAULT_PERSONA.name


@pytest.mark.asyncio(loop_scope="session")
async def test_instructions_are_capped_and_trimmed(db):
    persona = await upsert_persona(db, instructions="  " + ("x" * (MAX_INSTRUCTIONS_CHARS + 500)))
    assert persona.instructions is not None
    assert len(persona.instructions) == MAX_INSTRUCTIONS_CHARS


@pytest.mark.asyncio(loop_scope="session")
async def test_empty_optional_normalises_to_none(db):
    persona = await upsert_persona(db, role="   ", instructions="")
    assert persona.role is None
    assert persona.instructions is None


def test_compose_system_default_when_none():
    system = compose_system(None, "chat")
    assert DEFAULT_PERSONA.name in system
    # surface mechanics always appended
    assert SURFACE_MECHANICS["chat"] in system


def test_compose_system_merges_soul_and_surface():
    persona = AgentPersona(
        name="Nova",
        role="chief of staff",
        tone="warm",
        principles="be useful",
        boundaries="stay safe",
        instructions="Always greet by first name.",
        enabled=True,
    )
    system = compose_system(persona, "capture")
    assert "You are Nova, chief of staff." in system
    assert "warm" in system
    assert "be useful" in system
    assert "stay safe" in system
    assert "Always greet by first name." in system
    # surface mechanics for capture appended after the SOUL
    assert SURFACE_MECHANICS["capture"] in system
    assert system.index("Nova") < system.index(SURFACE_MECHANICS["capture"])


def test_compose_system_disabled_uses_default():
    persona = AgentPersona(name="Nova", role="custom", enabled=False)
    system = compose_system(persona, "chat")
    assert "Nova" not in system
    assert DEFAULT_PERSONA.name in system
    assert SURFACE_MECHANICS["chat"] in system


def test_compose_system_unknown_surface_uses_chat_mechanics():
    system = compose_system(None, "voice")
    assert SURFACE_MECHANICS["chat"] in system


def test_resolve_greeting():
    assert resolve_greeting(None) == DEFAULT_PERSONA.greeting
    enabled = AgentPersona(name="Nova", greeting="Yo G", enabled=True)
    assert resolve_greeting(enabled) == "Yo G"
    disabled = AgentPersona(name="Nova", greeting="Yo G", enabled=False)
    assert resolve_greeting(disabled) == DEFAULT_PERSONA.greeting
