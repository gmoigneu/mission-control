from tests.helpers import login


async def test_contexts_crud_requires_auth(client):
    assert (await client.get("/contexts")).status_code == 401


async def test_contexts_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/contexts", json={"slug": "upsun", "name": "Upsun", "category": "work"}
    )
    assert created.status_code == 201
    cid = created.json()["id"]

    listing = await client.get("/contexts")
    assert listing.status_code == 200
    assert any(c["slug"] == "upsun" for c in listing.json())

    patched = await client.patch(f"/contexts/{cid}", json={"name": "Upsun PaaS"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Upsun PaaS"

    got = await client.get(f"/contexts/{cid}")
    assert got.json()["name"] == "Upsun PaaS"

    deleted = await client.delete(f"/contexts/{cid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/contexts/{cid}")).status_code == 404


async def test_get_missing_context_404(client, db):
    await login(client, db)
    import uuid

    assert (await client.get(f"/contexts/{uuid.uuid4()}")).status_code == 404


async def test_context_color_and_status(client, db):
    await login(client, db)

    created = await client.post(
        "/contexts",
        json={"slug": "oss", "name": "Open Source", "color": "teal", "status": "archived"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["color"] == "teal"
    assert body["status"] == "archived"
    cid = body["id"]

    # color omitted → stored/returned as null
    plain = await client.post("/contexts", json={"slug": "work", "name": "Work"})
    assert plain.status_code == 201
    assert plain.json()["color"] is None

    # update can change the color
    patched = await client.patch(f"/contexts/{cid}", json={"color": "blue"})
    assert patched.status_code == 200
    assert patched.json()["color"] == "blue"

    # an unknown color key is rejected
    bad = await client.post(
        "/contexts", json={"slug": "bad", "name": "Bad", "color": "chartreuse"}
    )
    assert bad.status_code == 422
