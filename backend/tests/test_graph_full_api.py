"""Endpoint tests for /graph/full and /graph/node/{id} (Neo4j-free via override)."""
from __future__ import annotations

from app.api.graph import get_runner
from app.main import app
from tests.helpers import login


class FakeRunner:
    def __init__(self, routes: list[tuple[str, list[dict]]]) -> None:
        self.routes = routes

    async def __call__(self, cypher: str, params: dict) -> list[dict]:
        for needle, rows in self.routes:
            if needle in cypher:
                return list(rows)
        return []


def _use_runner(runner) -> None:
    app.dependency_overrides[get_runner] = lambda: runner


async def test_graph_full_requires_auth(client):
    assert (await client.get("/graph/full")).status_code == 401


async def test_graph_full_returns_snapshot(client, db):
    await login(client, db)
    _use_runner(
        FakeRunner(
            [
                ("AS source", [{"source": "a", "target": "b", "type": "KNOWS", "props": {}}]),
                ("MATCH (n)", [
                    {"id": "a", "label": "Person", "name": "Alice", "props": {}},
                    {"id": "b", "label": "Person", "name": "Bob", "props": {}},
                ]),
            ]
        )
    )
    try:
        resp = await client.get("/graph/full")
        assert resp.status_code == 200
        body = resp.json()
        assert {n["id"] for n in body["nodes"]} == {"a", "b"}
        assert body["edges"][0]["type"] == "KNOWS"
        assert body["truncated"] is False
    finally:
        app.dependency_overrides.pop(get_runner, None)


async def test_graph_node_detail_returns_node(client, db):
    await login(client, db)
    _use_runner(
        FakeRunner(
            [
                ("OPTIONAL MATCH (n)-[r]-(m)", [
                    {"label": "Person", "props": {"id": "a", "name": "Alice"}, "rels": []}
                ]),
            ]
        )
    )
    try:
        ok = await client.get("/graph/node/a")
        assert ok.status_code == 200
        assert ok.json()["label"] == "Person"
    finally:
        app.dependency_overrides.pop(get_runner, None)


async def test_graph_node_missing_returns_404(client, db):
    await login(client, db)
    _use_runner(FakeRunner([("OPTIONAL MATCH (n)-[r]-(m)", [])]))
    try:
        missing = await client.get("/graph/node/missing")
        assert missing.status_code == 404
    finally:
        app.dependency_overrides.pop(get_runner, None)


async def test_graph_neighborhood_returns_snapshot(client, db):
    await login(client, db)
    _use_runner(
        FakeRunner(
            [
                ("AS source", [{"source": "a", "target": "b", "type": "KNOWS", "props": {}}]),
                ("[*1..2]", [
                    {"id": "a", "label": "Person", "name": "Alice", "props": {}},
                    {"id": "b", "label": "Project", "name": "Launch", "props": {}},
                ]),
            ]
        )
    )
    try:
        resp = await client.get("/graph/neighborhood/a?depth=2")
        assert resp.status_code == 200
        body = resp.json()
        assert {n["id"] for n in body["nodes"]} == {"a", "b"}
        assert body["edges"][0]["type"] == "KNOWS"
    finally:
        app.dependency_overrides.pop(get_runner, None)


async def test_graph_neighborhood_missing_returns_404(client, db):
    await login(client, db)
    _use_runner(FakeRunner([("[*1..2]", [])]))
    try:
        missing = await client.get("/graph/neighborhood/missing?depth=2")
        assert missing.status_code == 404
    finally:
        app.dependency_overrides.pop(get_runner, None)
