import uuid

from tests.helpers import login


async def test_inbox_crud_requires_auth(client):
    assert (await client.get("/inbox")).status_code == 401


async def test_inbox_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/inbox",
        json={"body": "triage me later", "source": "capture"},
    )
    assert created.status_code == 201
    data = created.json()
    iid = data["id"]
    assert data["body"] == "triage me later"
    assert data["status"] == "open"
    assert data["source"] == "capture"

    listing = await client.get("/inbox")
    assert listing.status_code == 200
    assert any(i["id"] == iid for i in listing.json())

    patched = await client.patch(f"/inbox/{iid}", json={"status": "processed"})
    assert patched.status_code == 200
    assert patched.json()["status"] == "processed"

    got = await client.get(f"/inbox/{iid}")
    assert got.json()["status"] == "processed"

    deleted = await client.delete(f"/inbox/{iid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/inbox/{iid}")).status_code == 404


async def test_inbox_status_filter(client, db):
    await login(client, db)

    open_item = await client.post("/inbox", json={"body": "still open"})
    assert open_item.status_code == 201
    processed_item = await client.post(
        "/inbox", json={"body": "already processed", "status": "processed"}
    )
    assert processed_item.status_code == 201

    open_listing = await client.get("/inbox?status=open")
    assert open_listing.status_code == 200
    open_bodies = [i["body"] for i in open_listing.json()]
    assert "still open" in open_bodies
    assert "already processed" not in open_bodies

    processed_listing = await client.get("/inbox?status=processed")
    assert processed_listing.status_code == 200
    processed_bodies = [i["body"] for i in processed_listing.json()]
    assert "already processed" in processed_bodies


async def test_inbox_list_pagination_headers(client, db):
    await login(client, db)

    for i in range(3):
        created = await client.post("/inbox", json={"body": f"paged inbox {i}"})
        assert created.status_code == 201

    first = await client.get("/inbox?limit=2&offset=0")
    assert first.status_code == 200
    assert len(first.json()) == 2
    assert first.headers["X-Total-Count"] == "3"
    assert first.headers["X-Limit"] == "2"
    assert first.headers["X-Offset"] == "0"
    assert first.headers["X-Next-Offset"] == "2"

    last = await client.get("/inbox?limit=2&offset=2")
    assert last.status_code == 200
    assert len(last.json()) == 1
    assert "X-Next-Offset" not in last.headers


async def test_get_missing_inbox_item_404(client, db):
    await login(client, db)

    assert (await client.get(f"/inbox/{uuid.uuid4()}")).status_code == 404
