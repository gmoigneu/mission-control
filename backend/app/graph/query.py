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


_FULL_NODES = (
    "MATCH (n) "
    "RETURN n.id AS id, labels(n)[0] AS label, "
    "coalesce(n.name, n.title, n.slug, n.id) AS name, properties(n) AS props "
    "LIMIT $limit"
)

_CONTEXT_NODES = (
    "MATCH (c:Context {slug: $slug}) "
    "OPTIONAL MATCH (c)<-[:IN_CONTEXT|PART_OF]-(m) "
    "WITH collect(DISTINCT c) + collect(DISTINCT m) AS ns "
    "UNWIND ns AS n "
    "WITH DISTINCT n "
    "RETURN n.id AS id, labels(n)[0] AS label, "
    "coalesce(n.name, n.title, n.slug, n.id) AS name, properties(n) AS props"
)

_EDGES_AMONG = (
    "MATCH (a)-[r]->(b) WHERE a.id IN $ids AND b.id IN $ids "
    "RETURN a.id AS source, b.id AS target, type(r) AS type, properties(r) AS props"
)

_NODE_DETAIL = (
    "MATCH (n {id: $id}) "
    "OPTIONAL MATCH (n)-[r]-(m) "
    "RETURN labels(n)[0] AS label, properties(n) AS props, "
    "collect(CASE WHEN m IS NULL THEN NULL ELSE {"
    "rel: type(r), dir: CASE WHEN startNode(r) = n THEN 'out' ELSE 'in' END, "
    "id: m.id, label: labels(m)[0], "
    "name: coalesce(m.name, m.title, m.slug, m.id)} END) AS rels"
)


async def full_graph(
    run: Runner, *, context: str | None = None, limit: int = 5000
) -> dict:
    """Return the whole graph (or a single context's induced subgraph).

    Shape: ``{"nodes": [...], "edges": [...], "truncated": bool}``.
    Edges are constrained to the returned node set. ``truncated`` is only ever
    True for the unfiltered case when the node count reaches ``limit``.
    """
    if context:
        nodes = await run(_CONTEXT_NODES, {"slug": context})
    else:
        nodes = await run(_FULL_NODES, {"limit": limit})

    ids = [n["id"] for n in nodes]
    edges = await run(_EDGES_AMONG, {"ids": ids}) if ids else []
    truncated = context is None and len(nodes) >= limit
    return {"nodes": nodes, "edges": edges, "truncated": truncated}


async def node_detail(run: Runner, node_id: str) -> dict | None:
    """Return a single node's props + incident relationships (any label).

    Returns ``None`` when no node has ``node_id``.
    """
    rows = await run(_NODE_DETAIL, {"id": node_id})
    if not rows:
        return None
    row = rows[0]
    rels = [r for r in (row.get("rels") or []) if r is not None]
    return {"id": node_id, "label": row["label"], "props": row["props"], "rels": rels}
