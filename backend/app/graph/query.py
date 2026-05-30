"""Structured Neo4j query helpers."""
from __future__ import annotations

from app.graph.client import Runner


async def who_at_company(run: Runner, company_slug: str) -> list[dict]:
    """Return all people who work at the given company (matched by slug)."""
    return await run(
        "MATCH (p:Person)-[:WORKS_AT]->(c:Company {slug: $slug}) "
        "RETURN p.id AS id, p.name AS name",
        {"slug": company_slug},
    )


async def connection_path(run: Runner, from_id: str, to_id: str) -> list[dict]:
    """Return the shortest KNOWS path between two Person nodes.

    Returns a list of dicts with ``id`` and ``name`` for each person on the
    path.  An empty list means no path exists.
    """
    rows = await run(
        "MATCH (a:Person {id: $from_id}), (b:Person {id: $to_id}) "
        "MATCH path = shortestPath((a)-[:KNOWS*]-(b)) "
        "UNWIND nodes(path) AS n "
        "RETURN n.id AS id, coalesce(n.name, n.slug) AS name",
        {"from_id": from_id, "to_id": to_id},
    )
    return rows


async def neighbors(run: Runner, person_id: str) -> list[dict]:
    """Return all nodes directly connected to a Person (any relationship type)."""
    return await run(
        "MATCH (p:Person {id: $id})-[r]-(n) "
        "RETURN n.id AS id, labels(n)[0] AS label, type(r) AS rel, "
        "coalesce(n.name, n.title, n.slug) AS label_text",
        {"id": person_id},
    )
