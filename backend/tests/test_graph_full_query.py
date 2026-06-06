"""Tests for the full-graph and node-detail query helpers (Neo4j-free)."""
from __future__ import annotations

from app.graph.query import full_graph, node_detail


class MapRunner:
    """Routes each call to a handler keyed by a substring of the cypher."""

    def __init__(self, routes: list[tuple[str, list[dict]]]) -> None:
        # routes: list of (substring, rows). First matching substring wins.
        self.routes = routes
        self.calls: list[tuple[str, dict]] = []

    async def __call__(self, cypher: str, params: dict) -> list[dict]:
        self.calls.append((cypher, params))
        for needle, rows in self.routes:
            if needle in cypher:
                return list(rows)
        return []


async def test_full_graph_unfiltered_returns_nodes_and_edges() -> None:
    runner = MapRunner(
        [
            ("AS source", [{"source": "a", "target": "b", "type": "KNOWS", "props": {}}]),
            ("MATCH (n)", [
                {"id": "a", "label": "Person", "name": "Alice", "props": {"id": "a"}},
                {"id": "b", "label": "Person", "name": "Bob", "props": {"id": "b"}},
            ]),
        ]
    )
    result = await full_graph(runner, context=None, limit=5000)
    assert {n["id"] for n in result["nodes"]} == {"a", "b"}
    assert result["edges"][0]["source"] == "a"
    assert result["truncated"] is False
    # edges query must constrain to the returned ids
    edge_call = next(c for c in runner.calls if "AS source" in c[0])
    assert edge_call[1]["ids"] == ["a", "b"]


async def test_full_graph_sets_truncated_when_limit_hit() -> None:
    rows = [{"id": str(i), "label": "Task", "name": str(i), "props": {}} for i in range(3)]
    runner = MapRunner([("AS source", []), ("MATCH (n)", rows)])
    result = await full_graph(runner, context=None, limit=3)
    assert result["truncated"] is True


async def test_full_graph_context_filter_uses_slug_and_does_not_truncate() -> None:
    runner = MapRunner(
        [
            ("AS source", []),
            ("Context {slug", [{"id": "c", "label": "Context", "name": "Work", "props": {}}]),
        ]
    )
    result = await full_graph(runner, context="work", limit=5000)
    assert result["truncated"] is False
    node_call = next(c for c in runner.calls if "Context {slug" in c[0])
    assert node_call[1]["slug"] == "work"


async def test_full_graph_skips_edge_query_when_no_nodes() -> None:
    runner = MapRunner([("AS source", []), ("MATCH (n)", [])])
    result = await full_graph(runner, context=None, limit=10)
    assert result["nodes"] == []
    assert result["edges"] == []
    assert all("AS source" not in c[0] for c in runner.calls)


async def test_node_detail_returns_props_and_filters_null_rels() -> None:
    runner = MapRunner(
        [
            ("OPTIONAL MATCH (n)-[r]-(m)", [
                {
                    "label": "Person",
                    "props": {"id": "a", "name": "Alice"},
                    "rels": [
                        {"rel": "WORKS_AT", "dir": "out", "id": "co", "label": "Company", "name": "Acme"},
                        None,
                    ],
                }
            ]),
        ]
    )
    result = await node_detail(runner, "a")
    assert result is not None
    assert result["label"] == "Person"
    assert result["props"]["name"] == "Alice"
    assert len(result["rels"]) == 1
    assert result["rels"][0]["id"] == "co"


async def test_node_detail_returns_none_for_unknown_id() -> None:
    runner = MapRunner([("OPTIONAL MATCH (n)-[r]-(m)", [])])
    assert await node_detail(runner, "missing") is None
