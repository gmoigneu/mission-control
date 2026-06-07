"""
Fidelity tests for the aya vault importer.

Separate from test_import_aya.py (which asserts exact counts on the minimal
fixture). These exercise the higher-fidelity behaviors against a dedicated
fixture vault at tests/fixtures/aya_vault_fidelity/, asserting on specific rows
by slug so they stay robust as the fixture grows.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models.company import Company
from app.models.context import Context
from app.models.knowledge import Knowledge
from app.models.observation import Observation
from app.models.person import Person
from app.models.relationship import Relationship

FIXTURE = Path(__file__).parent / "fixtures" / "aya_vault_fidelity"


async def _edge(db, from_slug: str, to_slug: str):
    """Return the Relationship row between two people (by slug), or None."""
    frm = await _person(db, from_slug)
    to = await _person(db, to_slug)
    if frm is None or to is None:
        return None
    return (
        await db.execute(
            select(Relationship).where(
                Relationship.from_person_id == frm.id,
                Relationship.to_person_id == to.id,
            )
        )
    ).scalar_one_or_none()


async def _person(db, slug: str) -> Person | None:
    return (await db.execute(select(Person).where(Person.slug == slug))).scalar_one_or_none()


async def _context_id(db, slug: str):
    ctx = (await db.execute(select(Context).where(Context.slug == slug))).scalar_one_or_none()
    return ctx.id if ctx else None


@pytest.mark.asyncio
async def test_context_resolution_via_company_and_category(db):
    """A `contexts: work` person whose company matches a context slug links to it;
    a `contexts: personal` person links via direct slug match; an unmatched
    company resolves to no context."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    upsun_id = await _context_id(db, "upsun")
    personal_id = await _context_id(db, "personal")
    assert upsun_id is not None and personal_id is not None

    # company "Upsun" -> context "upsun" even though the tag is the category "work"
    dana = await _person(db, "dana-upsun")
    assert dana is not None
    assert dana.primary_context_id == upsun_id

    # direct slug match on the category tag "personal"
    evan = await _person(db, "evan-personal")
    assert evan is not None
    assert evan.primary_context_id == personal_id

    # company "Globex" is not a context -> no link
    frank = await _person(db, "frank-globex")
    assert frank is not None
    assert frank.primary_context_id is None


@pytest.mark.asyncio
async def test_company_sanitization_drops_junk_values(db):
    """A junk company value ("null") creates no company row and no linkage,
    while a real company ("Upsun") still imports."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    # no company row was created from the junk value
    null_co = (
        await db.execute(select(Company).where(Company.slug == "null"))
    ).scalar_one_or_none()
    assert null_co is None

    gina = await _person(db, "gina-noise")
    assert gina is not None
    assert gina.company_id is None

    # a legitimate company still imports and links
    upsun_co = (
        await db.execute(select(Company).where(Company.slug == "upsun"))
    ).scalar_one_or_none()
    assert upsun_co is not None
    dana = await _person(db, "dana-upsun")
    assert dana.company_id == upsun_co.id


@pytest.mark.asyncio
async def test_relationship_to_linked_vault_person(db):
    """A `reports_to: [dana-upsun](...)` link makes an edge to the existing
    person — not a stub."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    edge = await _edge(db, "holly-host", "dana-upsun")
    assert edge is not None
    assert edge.type == "reports_to"


@pytest.mark.asyncio
async def test_relationship_plain_name_creates_stub_person_and_edge(db):
    """A plain-name target becomes its own Person (slug from the name), with the
    `; context:` clause as its summary, and a graph edge from the file owner."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    tommy = await _person(db, "tommy-host")
    assert tommy is not None
    assert tommy.name == "Tommy Host"
    assert tommy.summary == "in primary school."

    edge = await _edge(db, "holly-host", "tommy-host")
    assert edge is not None
    assert edge.type == "parent_of"


@pytest.mark.asyncio
async def test_relationship_multiple_names_one_bullet(db):
    """`connected_to: Aaron Banks, Cara Dunn` → one Person + one edge each."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    for slug, name in (("aaron-banks", "Aaron Banks"), ("cara-dunn", "Cara Dunn")):
        p = await _person(db, slug)
        assert p is not None, slug
        assert p.name == name
        edge = await _edge(db, "holly-host", slug)
        assert edge is not None and edge.type == "connected_to"


@pytest.mark.asyncio
async def test_relationship_name_guard_skips_non_people(db):
    """`spouse: name unknown` and a descriptive `Employee context:` line create
    neither a Person nor an edge."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    # "name unknown" must not become a person
    assert await _person(db, "name-unknown") is None
    assert await _person(db, "unknown") is None
    # the descriptive employee-context line must not spawn an "Upsun" person edge
    assert await _person(db, "upsun") is None  # "Upsun" is a company, not a person
    # holly has exactly the three real edges (dana, tommy, aaron, cara) = 4
    holly = await _person(db, "holly-host")
    edges = (
        await db.execute(
            select(Relationship).where(Relationship.from_person_id == holly.id)
        )
    ).scalars().all()
    assert len(edges) == 4


@pytest.mark.asyncio
async def test_bare_multiblock_file_with_h3_sections(db):
    """A bare-frontmatter, multi-block file using ### sub-headings still imports
    its person, its ### Observations, and its ### Relationships (→ stub + edge)."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    ivan = await _person(db, "ivan-bare")
    assert ivan is not None
    assert ivan.name == "Ivan Bare"
    # company "Upsun" → upsun context (resolution works through the bare parser)
    assert ivan.primary_context_id == await _context_id(db, "upsun")

    # ### Observations under a multi-block file is extracted
    obs = (
        await db.execute(
            select(Observation).where(Observation.subject_id == ivan.id)
        )
    ).scalars().all()
    assert any("design docs" in (o.body or "") for o in obs)

    # ### Relationships in the second block → stub person + married_to edge
    wanda = await _person(db, "wanda-bare")
    assert wanda is not None
    assert wanda.summary == "lives in Lyon."
    edge = await _edge(db, "ivan-bare", "wanda-bare")
    assert edge is not None and edge.type == "married_to"


@pytest.mark.asyncio
async def test_multiblock_same_section_in_both_blocks_is_merged(db):
    """When a section name appears in BOTH blocks (block 1 `## Relationships`
    shadowing block 2 `### Relationships`), both are extracted — so the second
    block's observations and relationships are not lost."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    karl = await _person(db, "karl-multi")
    assert karl is not None

    # both the work observation and the family observation survive
    obs_bodies = [
        o.body or ""
        for o in (
            await db.execute(
                select(Observation).where(Observation.subject_id == karl.id)
            )
        ).scalars().all()
    ]
    assert any("partnerships" in b.lower() for b in obs_bodies)
    assert any("daughter" in b.lower() for b in obs_bodies)

    # block 2's relationship is imported even though block 1 had a (skipped)
    # Relationships section first
    nadia = await _person(db, "nadia")
    assert nadia is not None
    assert nadia.summary == "at university."
    edge = await _edge(db, "karl-multi", "nadia")
    assert edge is not None and edge.type == "parent_of"


@pytest.mark.asyncio
async def test_knowledge_recurses_subfolders_and_tolerates_bad_yaml(db):
    """Knowledge import recurses into subfolders and ingests files whose
    frontmatter is malformed (body-only fallback)."""
    from scripts.import_aya import import_vault

    await import_vault(db, FIXTURE, reindex=False)

    # nested wiki/nested/deep-note.md imported via recursion
    deep = (
        await db.execute(select(Knowledge).where(Knowledge.slug == "deep-note"))
    ).scalar_one_or_none()
    assert deep is not None
    assert deep.title == "Deep Nested Note"

    # malformed-frontmatter file still imported, body preserved
    broken = (
        await db.execute(select(Knowledge).where(Knowledge.slug == "broken-note"))
    ).scalar_one_or_none()
    assert broken is not None
    assert "Body survives" in (broken.body or "")


@pytest.mark.asyncio
async def test_dry_run_persists_nothing(db):
    """--dry-run parses and counts but writes no rows."""
    from scripts.import_aya import import_vault

    stats = await import_vault(db, FIXTURE, reindex=False, dry_run=True)

    # it did the work (counts are populated)
    assert stats.people >= 5
    assert stats.contexts == 2

    # ...but nothing was persisted
    assert (await db.execute(select(func.count()).select_from(Person))).scalar_one() == 0
    assert (await db.execute(select(func.count()).select_from(Context))).scalar_one() == 0


@pytest.mark.asyncio
async def test_reset_clears_existing_rows_first(db):
    """--reset wipes importer-owned tables before importing, so stray/demo rows
    are gone and only vault data remains."""
    from app.models.person import Person as PersonModel
    from scripts.import_aya import import_vault

    # seed a stray (demo-like) person
    db.add(PersonModel(id=uuid.uuid4(), slug="stray-demo", name="Stray Demo"))
    await db.flush()
    assert await _person(db, "stray-demo") is not None

    await import_vault(db, FIXTURE, reindex=False, reset=True)

    # the stray row is gone…
    assert await _person(db, "stray-demo") is None
    # …and the vault data is present
    assert await _person(db, "dana-upsun") is not None
