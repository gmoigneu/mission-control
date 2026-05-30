import uuid

from tests.helpers import login


async def test_tags_crud_requires_auth(client):
    assert (await client.get("/tags")).status_code == 401


async def test_tags_crud_flow(client, db):
    await login(client, db)

    created = await client.post("/tags", json={"name": "ai", "kind": "domain"})
    assert created.status_code == 201
    data = created.json()
    tid = data["id"]
    assert data["name"] == "ai"
    assert data["kind"] == "domain"

    listing = await client.get("/tags")
    assert listing.status_code == 200
    assert any(t["name"] == "ai" for t in listing.json())

    patched = await client.patch(f"/tags/{tid}", json={"kind": "topic"})
    assert patched.status_code == 200
    assert patched.json()["kind"] == "topic"

    got = await client.get(f"/tags/{tid}")
    assert got.json()["kind"] == "topic"

    deleted = await client.delete(f"/tags/{tid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/tags/{tid}")).status_code == 404


async def test_get_missing_tag_404(client, db):
    await login(client, db)
    assert (await client.get(f"/tags/{uuid.uuid4()}")).status_code == 404
