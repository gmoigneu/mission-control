from tests.helpers import login


async def test_inbox_invalid_status_returns_422(client, db):
    """Enum validation rejects unknown status values at the boundary."""
    await login(client, db)
    r = await client.post("/inbox", json={"title": "Bad Status", "status": "potato"})
    assert r.status_code == 422


async def test_inbox_invalid_source_type_returns_422(client, db):
    """Enum validation rejects unknown source_type values at the boundary."""
    await login(client, db)
    r = await client.post("/inbox", json={"title": "Bad Source", "source_type": "banana"})
    assert r.status_code == 422


async def test_inbox_crud_requires_auth(client):
    assert (await client.get("/inbox")).status_code == 401


async def test_inbox_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/inbox", json={"title": "Read SQLAlchemy docs", "source_type": "article"}
    )
    assert created.status_code == 201
    data = created.json()
    iid = data["id"]
    assert data["status"] == "queued"
    assert data["priority"] == "normal"
    assert data["source_type"] == "article"

    listing = await client.get("/inbox")
    assert listing.status_code == 200
    assert any(i["title"] == "Read SQLAlchemy docs" for i in listing.json())

    reviewed = await client.patch(f"/inbox/{iid}", json={"status": "reviewed"})
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "reviewed"

    archived = await client.patch(f"/inbox/{iid}", json={"status": "archived"})
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"

    got = await client.get(f"/inbox/{iid}")
    assert got.json()["status"] == "archived"

    deleted = await client.delete(f"/inbox/{iid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/inbox/{iid}")).status_code == 404


async def test_get_missing_inbox_item_404(client, db):
    await login(client, db)
    import uuid

    assert (await client.get(f"/inbox/{uuid.uuid4()}")).status_code == 404
