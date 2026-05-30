import uuid

from sqlalchemy import select

from app.models.chunk import Chunk
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

    reindex_resp = await client.post("/admin/reindex")
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
