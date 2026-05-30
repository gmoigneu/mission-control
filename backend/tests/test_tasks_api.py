from tests.helpers import login


async def test_tasks_invalid_status_returns_422(client, db):
    """I9 — enum validation rejects unknown status values at the boundary."""
    await login(client, db)
    r = await client.post("/tasks", json={"title": "Bad Status Task", "status": "potato"})
    assert r.status_code == 422


async def test_tasks_crud_requires_auth(client):
    assert (await client.get("/tasks")).status_code == 401


async def test_tasks_crud_flow(client, db):
    await login(client, db)

    created = await client.post("/tasks", json={"title": "Ship P1"})
    assert created.status_code == 201
    data = created.json()
    tid = data["id"]
    assert data["status"] == "open"
    assert data["priority"] == "normal"

    listing = await client.get("/tasks")
    assert listing.status_code == 200
    assert any(t["title"] == "Ship P1" for t in listing.json())

    patched = await client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
    assert patched.status_code == 200
    assert patched.json()["status"] == "in_progress"

    got = await client.get(f"/tasks/{tid}")
    assert got.json()["status"] == "in_progress"

    deleted = await client.delete(f"/tasks/{tid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/tasks/{tid}")).status_code == 404


async def test_get_missing_task_404(client, db):
    await login(client, db)
    import uuid

    assert (await client.get(f"/tasks/{uuid.uuid4()}")).status_code == 404
