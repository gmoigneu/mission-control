"""Graph projector: translates OutboxEvent payloads into Neo4j Cypher mutations."""
from __future__ import annotations

from app.graph.client import Runner

# Map aggregate_type → Neo4j label (these are node entities)
LABELS: dict[str, str] = {
    "context": "Context",
    "project": "Project",
    "company": "Company",
    "person": "Person",
    "task": "Task",
    "meeting": "Meeting",
}

# Scalar props to denormalise per entity type (id is always included)
_NODE_PROPS: dict[str, list[str]] = {
    "context": ["id", "slug", "name", "category", "status"],
    "project": ["id", "slug", "title", "status"],
    "company": ["id", "slug", "name", "domain"],
    "person": ["id", "slug", "name", "role", "email"],
    "task": ["id", "title", "status", "priority"],
    "meeting": ["id", "slug", "title", "at", "location"],
}

# FK-derived edges: {aggregate_type: [(fk_field, edge_type, target_label), ...]}
_FK_EDGES: dict[str, list[tuple[str, str, str]]] = {
    "person": [
        ("company_id", "WORKS_AT", "Company"),
        ("primary_context_id", "IN_CONTEXT", "Context"),
    ],
    "project": [
        ("context_id", "PART_OF", "Context"),
    ],
    "task": [
        ("context_id", "IN_CONTEXT", "Context"),
        ("project_id", "FOR_PROJECT", "Project"),
    ],
    "meeting": [
        ("context_id", "IN_CONTEXT", "Context"),
        ("project_id", "FOR_PROJECT", "Project"),
    ],
}


async def project_event(run: Runner, aggregate_type: str, op: str, payload: dict) -> None:
    """Project a single outbox event into the Neo4j graph."""

    # ── Node entities ──────────────────────────────────────────────────────────
    if aggregate_type in LABELS:
        label = LABELS[aggregate_type]
        entity_id = payload.get("id")
        if not entity_id:
            return

        if op == "upsert":
            # Build props dict from known scalar fields present in the payload
            prop_keys = _NODE_PROPS.get(aggregate_type, ["id"])
            props = {k: payload[k] for k in prop_keys if k in payload}

            await run(
                f"MERGE (n:{label} {{id: $id}}) SET n += $props",
                {"id": str(entity_id), "props": props},
            )

            # Refresh FK-derived outgoing edges
            for fk_field, edge_type, target_label in _FK_EDGES.get(aggregate_type, []):
                # Delete stale edges of this type first
                await run(
                    f"MATCH (n:{label} {{id: $id}})-[r:{edge_type}]->() DELETE r",
                    {"id": str(entity_id)},
                )
                fk_value = payload.get(fk_field)
                if fk_value:
                    # Ensure target node exists (stub merge), then create edge
                    await run(
                        f"MERGE (m:{target_label} {{id: $fk}})",
                        {"fk": str(fk_value)},
                    )
                    await run(
                        f"MATCH (n:{label} {{id: $id}}) "
                        f"MATCH (m:{target_label} {{id: $fk}}) "
                        f"MERGE (n)-[:{edge_type}]->(m)",
                        {"id": str(entity_id), "fk": str(fk_value)},
                    )

        elif op == "delete":
            await run(
                f"MATCH (n:{label} {{id: $id}}) DETACH DELETE n",
                {"id": str(entity_id)},
            )

        return

    # ── Relationship entity → KNOWS edge ──────────────────────────────────────
    if aggregate_type == "relationship":
        rel_id = str(payload.get("id", ""))
        if op == "upsert":
            from_id = str(payload.get("from_person_id", ""))
            to_id = str(payload.get("to_person_id", ""))
            rel_type = payload.get("type", "knows")
            since = payload.get("since")
            await run("MERGE (a:Person {id: $from_id})", {"from_id": from_id})
            await run("MERGE (b:Person {id: $to_id})", {"to_id": to_id})
            await run(
                "MATCH (a:Person {id: $from_id}) MATCH (b:Person {id: $to_id}) "
                "MERGE (a)-[k:KNOWS {rel_id: $rel_id}]->(b) "
                "SET k.type = $type, k.since = $since",
                {"from_id": from_id, "to_id": to_id, "rel_id": rel_id,
                 "type": rel_type, "since": since},
            )
        elif op == "delete":
            await run(
                "MATCH ()-[k:KNOWS {rel_id: $rel_id}]-() DELETE k",
                {"rel_id": rel_id},
            )
        return

    # ── TaskLink entity → LINKED edge ─────────────────────────────────────────
    if aggregate_type == "task_link":
        link_id = str(payload.get("id", ""))
        if op == "upsert":
            from_id = str(payload.get("from_task_id", ""))
            to_id = str(payload.get("to_task_id", ""))
            kind = payload.get("kind", "related")
            await run("MERGE (a:Task {id: $from_id})", {"from_id": from_id})
            await run("MERGE (b:Task {id: $to_id})", {"to_id": to_id})
            await run(
                "MATCH (a:Task {id: $from_id}) MATCH (b:Task {id: $to_id}) "
                "MERGE (a)-[l:LINKED {link_id: $link_id}]->(b) "
                "SET l.kind = $kind",
                {"from_id": from_id, "to_id": to_id, "link_id": link_id, "kind": kind},
            )
        elif op == "delete":
            await run(
                "MATCH ()-[l:LINKED {link_id: $link_id}]-() DELETE l",
                {"link_id": link_id},
            )
        return

    # ── EntityLink entity → RELATES_TO edge ───────────────────────────────────
    if aggregate_type == "entity_link":
        link_id = str(payload.get("id", ""))
        from_type = payload.get("from_type", "")
        to_type = payload.get("to_type", "")
        # Only project if both sides are known node entities
        if from_type not in LABELS or to_type not in LABELS:
            return
        from_label = LABELS[from_type]
        to_label = LABELS[to_type]
        if op == "upsert":
            from_id = str(payload.get("from_id", ""))
            to_id = str(payload.get("to_id", ""))
            kind = payload.get("kind", "related")
            await run(f"MERGE (a:{from_label} {{id: $from_id}})", {"from_id": from_id})
            await run(f"MERGE (b:{to_label} {{id: $to_id}})", {"to_id": to_id})
            await run(
                f"MATCH (a:{from_label} {{id: $from_id}}) "
                f"MATCH (b:{to_label} {{id: $to_id}}) "
                "MERGE (a)-[r:RELATES_TO {link_id: $link_id}]->(b) "
                "SET r.kind = $kind",
                {"from_id": from_id, "to_id": to_id, "link_id": link_id, "kind": kind},
            )
        elif op == "delete":
            await run(
                "MATCH ()-[r:RELATES_TO {link_id: $link_id}]-() DELETE r",
                {"link_id": link_id},
            )
        return

    # Unknown aggregate_type → silently ignore
