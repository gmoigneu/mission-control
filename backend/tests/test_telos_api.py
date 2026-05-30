import uuid

from tests.helpers import login


async def test_telos_crud_requires_auth(client):
    assert (await client.get("/telos")).status_code == 401


async def test_telos_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/telos", json={"kind": "mission", "title": "Augment humans with AI"}
    )
    assert created.status_code == 201
    tid = created.json()["id"]
    assert created.json()["kind"] == "mission"

    listing = await client.get("/telos")
    assert listing.status_code == 200
    assert any(t["title"] == "Augment humans with AI" for t in listing.json())

    patched = await client.patch(f"/telos/{tid}", json={"title": "Augment everyone with AI"})
    assert patched.status_code == 200
    assert patched.json()["title"] == "Augment everyone with AI"

    got = await client.get(f"/telos/{tid}")
    assert got.json()["title"] == "Augment everyone with AI"

    deleted = await client.delete(f"/telos/{tid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/telos/{tid}")).status_code == 404


async def test_telos_child_parent_link(client, db):
    await login(client, db)

    parent = await client.post("/telos", json={"kind": "mission", "title": "North star"})
    assert parent.status_code == 201
    parent_id = parent.json()["id"]

    child = await client.post(
        "/telos",
        json={"kind": "goal", "title": "Ship CE", "parent_id": parent_id},
    )
    assert child.status_code == 201
    assert child.json()["parent_id"] == parent_id


async def test_get_missing_telos_404(client, db):
    await login(client, db)

    assert (await client.get(f"/telos/{uuid.uuid4()}")).status_code == 404
