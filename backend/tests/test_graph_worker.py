"""Tests for the graph outbox worker (Neo4j-free using a FakeRunner)."""
from __future__ import annotations

import uuid

from app.graph.worker import process_outbox
from app.models.outbox import OutboxEvent


class FakeRunner:
    """Records (cypher, params) calls and returns []."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def __call__(self, cypher: str, params: dict) -> list[dict]:
        self.calls.append((cypher, params))
        return []


async def _add_event(db, aggregate_type: str, op: str, payload: dict) -> OutboxEvent:
    evt = OutboxEvent(
        aggregate_type=aggregate_type,
        aggregate_id=uuid.UUID(payload["id"]) if "id" in payload else uuid.uuid4(),
        op=op,
        payload=payload,
    )
    db.add(evt)
    await db.flush()
    return evt


async def test_process_outbox_returns_event_count(db) -> None:
    fake = FakeRunner()
    person_id = str(uuid.uuid4())
    company_id = str(uuid.uuid4())

    await _add_event(
        db, "company", "upsert", {"id": company_id, "slug": "acme", "name": "Acme"}
    )
    await _add_event(
        db,
        "person",
        "upsert",
        {"id": person_id, "slug": "bob", "name": "Bob", "company_id": company_id},
    )

    count = await process_outbox(db, fake)
    assert count >= 2


async def test_process_outbox_marks_processed_at(db) -> None:
    fake = FakeRunner()
    person_id = str(uuid.uuid4())

    evt = await _add_event(db, "context", "upsert",
                           {"id": person_id, "slug": "work", "name": "Work"})
    evt_id = evt.id

    await process_outbox(db, fake)

    # Re-fetch to confirm processed_at was set
    refreshed = await db.get(OutboxEvent, evt_id)
    assert refreshed is not None
    assert refreshed.processed_at is not None


async def test_process_outbox_only_processes_unprocessed(db) -> None:
    fake = FakeRunner()
    ctx_id = str(uuid.uuid4())

    # This event will be processed
    await _add_event(
        db,
        "context",
        "upsert",
        {"id": ctx_id, "slug": f"s-{uuid.uuid4().hex[:6]}", "name": "N"},
    )

    await process_outbox(db, fake)
    calls_after_first = len(fake.calls)

    # Running again should not re-process
    count_second = await process_outbox(db, fake)
    assert count_second == 0
    assert len(fake.calls) == calls_after_first  # no new Cypher calls


async def test_process_outbox_invokes_projector_for_each_event(db) -> None:
    fake = FakeRunner()
    company_id = str(uuid.uuid4())
    person_id = str(uuid.uuid4())

    await _add_event(
        db, "company", "upsert", {"id": company_id, "slug": "widget", "name": "Widgets"}
    )
    await _add_event(
        db, "person", "upsert", {"id": person_id, "slug": "alice", "name": "Alice"}
    )

    await process_outbox(db, fake)

    cyphers = [c for c, _ in fake.calls]
    assert any("Company" in c for c in cyphers), "Expected a Company Cypher call"
    assert any("Person" in c for c in cyphers), "Expected a Person Cypher call"
