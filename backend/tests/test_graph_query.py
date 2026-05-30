"""Tests for graph query helpers (Neo4j-free using a FakeRunner)."""
from __future__ import annotations

from app.graph.query import connection_path, neighbors, who_at_company


class FakeRunner:
    """Records calls and returns an empty list."""

    def __init__(self, returns: list[dict] | None = None) -> None:
        self.calls: list[tuple[str, dict]] = []
        self._returns = returns or []

    async def __call__(self, cypher: str, params: dict) -> list[dict]:
        self.calls.append((cypher, params))
        return list(self._returns)


# ─── who_at_company ────────────────────────────────────────────────────────────

async def test_who_at_company_emits_correct_cypher() -> None:
    fake = FakeRunner()
    await who_at_company(fake, "acme")
    assert len(fake.calls) == 1
    cypher, params = fake.calls[0]
    assert "WORKS_AT" in cypher
    assert "Company {slug" in cypher or "Company {slug:" in cypher or "slug: $slug" in cypher
    assert params.get("slug") == "acme"


async def test_who_at_company_returns_runner_rows() -> None:
    fake = FakeRunner(returns=[{"id": "p1", "name": "Alice"}])
    result = await who_at_company(fake, "acme")
    assert result == [{"id": "p1", "name": "Alice"}]


# ─── connection_path ───────────────────────────────────────────────────────────

async def test_connection_path_emits_shortest_path_cypher() -> None:
    fake = FakeRunner()
    await connection_path(fake, "p1", "p2")
    assert len(fake.calls) == 1
    cypher, params = fake.calls[0]
    assert "shortestPath" in cypher
    assert "KNOWS" in cypher
    assert params.get("from_id") == "p1"
    assert params.get("to_id") == "p2"


# ─── neighbors ─────────────────────────────────────────────────────────────────

async def test_neighbors_emits_correct_cypher() -> None:
    fake = FakeRunner()
    await neighbors(fake, "p1")
    assert len(fake.calls) == 1
    cypher, params = fake.calls[0]
    assert "Person {id" in cypher or "Person {id:" in cypher or "id: $id" in cypher
    assert params.get("id") == "p1"
