"""
Tests for the aya vault → Postgres importer.

Uses a minimal fixture vault at tests/fixtures/aya_vault/ and the shared
pytest-asyncio session-scoped Postgres DB from conftest.py.

Neo4j is NOT exercised here; the importer skips the graph rebuild.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models.company import Company
from app.models.context import Context
from app.models.knowledge import Knowledge
from app.models.observation import Observation
from app.models.person import Person
from app.models.project import Project
from app.models.relationship import Relationship
from app.models.task import Task

FIXTURE_VAULT = Path(__file__).parent / "fixtures" / "aya_vault"


async def _count(db, model):
    result = await db.execute(select(func.count()).select_from(model))
    return result.scalar_one()


@pytest.mark.asyncio
async def test_import_fixture_vault_creates_entities(db):
    """Running the importer against the fixture vault creates all expected rows."""
    from scripts.import_aya import import_vault

    stats = await import_vault(db, FIXTURE_VAULT, reindex=False)

    # Exactly one context (work/)
    assert stats.contexts == 1
    ctx_count = await _count(db, Context)
    assert ctx_count >= 1

    # Exactly one company (Acme Corp) — both alice and bob share it
    assert stats.companies == 1
    co_count = await _count(db, Company)
    assert co_count >= 1

    # Two people
    assert stats.people == 2
    p_count = await _count(db, Person)
    assert p_count >= 2

    # One project (alpha-project)
    assert stats.projects == 1
    proj_count = await _count(db, Project)
    assert proj_count >= 1

    # One task
    assert stats.tasks == 1
    t_count = await _count(db, Task)
    assert t_count >= 1

    # At least one observation (alice has 2 obs + 1 pref + 1 open_loop, bob has 1)
    assert stats.observations >= 1
    obs_count = await _count(db, Observation)
    assert obs_count >= 1

    # At least one relationship (alice → bob colleague)
    assert stats.relationships >= 1
    rel_count = await _count(db, Relationship)
    assert rel_count >= 1

    # One knowledge note (04.knowledge/raw/sample-note.md)
    assert stats.knowledge == 1
    k_count = await _count(db, Knowledge)
    assert k_count >= 1


@pytest.mark.asyncio
async def test_import_fixture_vault_idempotent(db):
    """Running the importer twice produces no duplicate rows."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE_VAULT, reindex=False)

    ctx_before = await _count(db, Context)
    co_before = await _count(db, Company)
    p_before = await _count(db, Person)
    proj_before = await _count(db, Project)
    t_before = await _count(db, Task)
    obs_before = await _count(db, Observation)
    rel_before = await _count(db, Relationship)
    k_before = await _count(db, Knowledge)

    # Second run
    await import_vault(db, FIXTURE_VAULT, reindex=False)

    assert await _count(db, Context) == ctx_before
    assert await _count(db, Company) == co_before
    assert await _count(db, Person) == p_before
    assert await _count(db, Project) == proj_before
    assert await _count(db, Task) == t_before
    assert await _count(db, Observation) == obs_before
    assert await _count(db, Relationship) == rel_before
    assert await _count(db, Knowledge) == k_before


@pytest.mark.asyncio
async def test_import_context_fields(db):
    """Context row has expected slug, name, category."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE_VAULT, reindex=False)

    result = await db.execute(select(Context).where(Context.slug == "work"))
    ctx = result.scalar_one_or_none()
    assert ctx is not None
    assert ctx.name == "work"
    assert ctx.category == "work"
    assert ctx.status == "active"


@pytest.mark.asyncio
async def test_import_person_fields(db):
    """Person row has expected slug, name, role, company linkage."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE_VAULT, reindex=False)

    result = await db.execute(select(Person).where(Person.slug == "alice-example"))
    alice = result.scalar_one_or_none()
    assert alice is not None
    assert alice.name == "Alice Example"
    assert alice.role == "Engineering Lead"
    assert alice.company_id is not None

    # Company name should be Acme Corp
    co_result = await db.execute(select(Company).where(Company.id == alice.company_id))
    co = co_result.scalar_one_or_none()
    assert co is not None
    assert co.name == "Acme Corp"


@pytest.mark.asyncio
async def test_import_relationship_alice_to_bob(db):
    """Alice → Bob colleague relationship is created."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE_VAULT, reindex=False)

    alice_r = await db.execute(select(Person).where(Person.slug == "alice-example"))
    alice = alice_r.scalar_one()
    bob_r = await db.execute(select(Person).where(Person.slug == "bob-example"))
    bob = bob_r.scalar_one()

    rel_r = await db.execute(
        select(Relationship).where(
            Relationship.from_person_id == alice.id,
            Relationship.to_person_id == bob.id,
        )
    )
    rel = rel_r.scalar_one_or_none()
    assert rel is not None
    assert rel.type == "colleague"


@pytest.mark.asyncio
async def test_import_knowledge_fields(db):
    """Knowledge row has expected slug, title, and body from the markdown file."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE_VAULT, reindex=False)

    result = await db.execute(select(Knowledge).where(Knowledge.slug == "sample-note"))
    note = result.scalar_one_or_none()
    assert note is not None
    assert note.title == "Sample Knowledge Note"
    assert note.body is not None
    assert "sample knowledge note" in note.body.lower()
