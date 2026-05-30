"""Tests that IntegrityError conditions return proper 4xx responses (I1)."""
import uuid

from tests.helpers import login


async def test_duplicate_context_slug_returns_409(client, db):
    await login(client, db)

    r1 = await client.post("/contexts", json={"slug": "dup-slug", "name": "First"})
    assert r1.status_code == 201

    r2 = await client.post("/contexts", json={"slug": "dup-slug", "name": "Second"})
    assert r2.status_code == 409


async def test_project_with_nonexistent_context_returns_422(client, db):
    await login(client, db)

    r = await client.post(
        "/projects",
        json={
            "context_id": str(uuid.uuid4()),
            "slug": "orphan-proj",
            "title": "Orphan Project",
        },
    )
    assert r.status_code == 422
