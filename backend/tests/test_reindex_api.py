import uuid

from sqlalchemy import select

from app.models.chunk import Chunk
from app.models.outbox import CHANNEL_GRAPH, CHANNEL_SEARCH, OutboxEvent
from tests.helpers import login


async def test_reindex_requires_auth(client):
    assert (await client.post("/admin/reindex")).status_code == 401


async def test_reindex_creates_chunks(client, db):
    await login(client, db, email=f"reindex-{uuid.uuid4()}@example.com", password="pw")

    ctx_resp = await client.post(
        "/contexts",
        json={"slug": f"ctx-{uuid.uuid4()}", "name": "Reindex Test Context", "category": "work"},
    )
    assert ctx_resp.status_code == 201
    ctx_id = uuid.UUID(ctx_resp.json()["id"])

    person_resp = await client.post(
        "/people",
        json={
            "slug": f"person-{uuid.uuid4()}",
            "name": "Reindex Test Person",
            "summary": "A test engineer",
        },
    )
    assert person_resp.status_code == 201
    person_id = uuid.UUID(person_resp.json()["id"])

    reindex_resp = await client.post("/admin/reindex?wait=true")
    assert reindex_resp.status_code == 200
    data = reindex_resp.json()
    assert data["reindexed"] >= 2

    ctx_chunks = (
        await db.execute(
            select(Chunk).where(Chunk.subject_type == "context", Chunk.subject_id == ctx_id)
        )
    ).scalars().all()
    assert len(ctx_chunks) >= 1

    person_chunks = (
        await db.execute(
            select(Chunk).where(Chunk.subject_type == "person", Chunk.subject_id == person_id)
        )
    ).scalars().all()
    assert len(person_chunks) >= 1


async def test_rebuild_graph_only_marks_graph_events_and_projects_meetings(
    client, db, monkeypatch
):
    await login(client, db, email=f"graph-rebuild-{uuid.uuid4()}@example.com", password="pw")

    meeting_resp = await client.post(
        "/meetings",
        json={
            "slug": f"meeting-{uuid.uuid4()}",
            "title": "Graph Rebuild Meeting",
            "at": "2026-06-21T10:00:00Z",
        },
    )
    assert meeting_resp.status_code == 201
    meeting_id = uuid.UUID(meeting_resp.json()["id"])

    calls: list[tuple[str, dict]] = []

    async def fake_runner(cypher: str, params: dict) -> list[dict]:
        calls.append((cypher, params))
        return []

    monkeypatch.setattr("app.graph.client.neo4j_runner", fake_runner)

    rebuild_resp = await client.post("/admin/rebuild-graph?wait=true")
    assert rebuild_resp.status_code == 200

    assert any("MERGE (n:Meeting" in cypher for cypher, _ in calls)

    rows = (
        await db.execute(select(OutboxEvent).where(OutboxEvent.aggregate_id == meeting_id))
    ).scalars().all()
    by_channel = {row.channel: row for row in rows}
    assert by_channel[CHANNEL_GRAPH].processed_at is not None
    assert by_channel[CHANNEL_SEARCH].processed_at is None


async def test_admin_maintenance_defaults_to_queued_job(client, db):
    await login(client, db, email=f"admin-job-{uuid.uuid4()}@example.com", password="pw")

    resp = await client.post("/admin/reindex")
    assert resp.status_code == 202
    body = resp.json()
    assert body["kind"] == "reindex"
    assert body["status"] in {"queued", "running", "succeeded"}

    status_resp = await client.get(f"/admin/jobs/{body['id']}")
    assert status_resp.status_code == 200
    assert status_resp.json()["id"] == body["id"]
