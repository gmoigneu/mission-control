"""Tests for the graph projector (Neo4j-free using a FakeRunner)."""
from __future__ import annotations

import pytest

from app.graph.projector import project_event


class FakeRunner:
    """Records (cypher, params) calls and returns []."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def __call__(self, cypher: str, params: dict) -> list[dict]:
        self.calls.append((cypher, params))
        return []

    def cyphers(self) -> list[str]:
        return [c for c, _ in self.calls]

    def has_cypher_matching(self, fragment: str) -> bool:
        return any(fragment in c for c in self.cyphers())


@pytest.fixture
def fake() -> FakeRunner:
    return FakeRunner()


# ─── Person upsert (with company_id) ──────────────────────────────────────────

async def test_person_upsert_creates_node(fake: FakeRunner) -> None:
    person_id = "aaaa-1111"
    await project_event(
        fake,
        "person",
        "upsert",
        {"id": person_id, "slug": "alice", "name": "Alice", "company_id": "bbbb-2222"},
    )
    assert fake.has_cypher_matching("MERGE (n:Person")
    matching_params = next(p for c, p in fake.calls if "MERGE (n:Person" in c)
    assert matching_params["id"] == person_id


async def test_person_upsert_creates_works_at_edge(fake: FakeRunner) -> None:
    company_id = "bbbb-2222"
    await project_event(
        fake,
        "person",
        "upsert",
        {"id": "aaaa-1111", "slug": "alice", "name": "Alice", "company_id": company_id},
    )
    assert fake.has_cypher_matching("WORKS_AT")
    edge_params = next(
        p for c, p in fake.calls if "WORKS_AT" in c and "MERGE" in c and "MATCH" in c
    )
    assert edge_params["fk"] == company_id
    assert edge_params["id"] == "aaaa-1111"


async def test_person_upsert_deletes_stale_works_at(fake: FakeRunner) -> None:
    """Before re-adding the edge the old one must be deleted."""
    await project_event(
        fake,
        "person",
        "upsert",
        {"id": "aaaa-1111", "slug": "alice", "name": "Alice", "company_id": "bbbb-2222"},
    )
    delete_calls = [c for c in fake.cyphers() if "DELETE r" in c and "WORKS_AT" in c]
    assert len(delete_calls) >= 1


# ─── Relationship upsert → KNOWS ──────────────────────────────────────────────

async def test_relationship_upsert_creates_knows_edge(fake: FakeRunner) -> None:
    rel_id = "rel-0001"
    await project_event(
        fake,
        "relationship",
        "upsert",
        {
            "id": rel_id,
            "from_person_id": "p1",
            "to_person_id": "p2",
            "type": "colleague",
            "since": "2024-01-01",
        },
    )
    assert fake.has_cypher_matching("KNOWS")
    knows_call = next((p for c, p in fake.calls if "KNOWS" in c and "rel_id" in c), None)
    assert knows_call is not None
    assert knows_call["rel_id"] == rel_id
    assert knows_call["type"] == "colleague"


# ─── Context delete → DETACH DELETE ───────────────────────────────────────────

async def test_context_delete_detach_deletes_node(fake: FakeRunner) -> None:
    ctx_id = "ctx-0001"
    await project_event(fake, "context", "delete", {"id": ctx_id, "slug": "work"})
    assert fake.has_cypher_matching("DETACH DELETE")
    detach_params = next(p for c, p in fake.calls if "DETACH DELETE" in c)
    assert detach_params["id"] == ctx_id


# ─── Non-node entity → ignored ────────────────────────────────────────────────

async def test_observation_upsert_is_ignored(fake: FakeRunner) -> None:
    await project_event(
        fake,
        "observation",
        "upsert",
        {"id": "obs-0001", "body": "something happened"},
    )
    assert len(fake.calls) == 0, "Observation should produce no Cypher calls"


async def test_tag_upsert_is_ignored(fake: FakeRunner) -> None:
    await project_event(fake, "tag", "upsert", {"id": "tag-0001", "name": "urgent"})
    assert len(fake.calls) == 0


async def test_audit_upsert_is_ignored(fake: FakeRunner) -> None:
    await project_event(fake, "audit", "upsert", {"id": "aud-0001"})
    assert len(fake.calls) == 0


# ─── entity_link with non-node type → ignored ────────────────────────────────

async def test_entity_link_with_unknown_type_is_ignored(fake: FakeRunner) -> None:
    await project_event(
        fake,
        "entity_link",
        "upsert",
        {"id": "el-0001", "from_type": "observation", "from_id": "obs-1",
         "to_type": "person", "to_id": "p1", "kind": "mentions"},
    )
    assert len(fake.calls) == 0


async def test_entity_link_between_nodes_projects(fake: FakeRunner) -> None:
    await project_event(
        fake,
        "entity_link",
        "upsert",
        {"id": "el-0002", "from_type": "person", "from_id": "p1",
         "to_type": "project", "to_id": "proj-1", "kind": "related"},
    )
    assert fake.has_cypher_matching("RELATES_TO")
