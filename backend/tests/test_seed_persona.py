"""Tests for the seed-persona CLI helper and demo persona seeding."""
import pytest

from app.agent.persona_store import get_persona
from app.cli import _seed_persona


@pytest.mark.asyncio(loop_scope="session")
async def test_seed_persona_sets_friendly_soul(db):
    await _seed_persona(db)
    persona = await get_persona(db)
    assert persona is not None
    assert persona.name == "Aya"
    assert persona.greeting
    assert persona.enabled is True


@pytest.mark.asyncio(loop_scope="session")
async def test_seed_demo_sets_persona(db):
    from app.demo_seed import seed_demo

    await seed_demo(
        db, email="demo-persona@example.com", password="pw", name="Demo", reset=False
    )
    persona = await get_persona(db)
    assert persona is not None
    assert persona.name == "Aya"
    assert persona.greeting
