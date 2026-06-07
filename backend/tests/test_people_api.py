from tests.helpers import login


async def test_people_crud_requires_auth(client):
    assert (await client.get("/people")).status_code == 401


async def test_people_crud_flow(client, db):
    await login(client, db)

    created = await client.post("/people", json={"slug": "fabien", "name": "Fabien"})
    assert created.status_code == 201
    pid = created.json()["id"]

    listing = await client.get("/people")
    assert listing.status_code == 200
    assert any(p["slug"] == "fabien" for p in listing.json())

    patched = await client.patch(f"/people/{pid}", json={"name": "Fabien Potencier"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Fabien Potencier"

    got = await client.get(f"/people/{pid}")
    assert got.json()["name"] == "Fabien Potencier"

    deleted = await client.delete(f"/people/{pid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/people/{pid}")).status_code == 404


async def test_get_missing_person_404(client, db):
    await login(client, db)
    import uuid

    assert (await client.get(f"/people/{uuid.uuid4()}")).status_code == 404


async def test_get_person_by_slug(client, db):
    await login(client, db)
    await client.post("/people", json={"slug": "magalie-pentier", "name": "Magalie Pentier"})

    found = await client.get("/people/by-slug/magalie-pentier")
    assert found.status_code == 200
    assert found.json()["name"] == "Magalie Pentier"

    assert (await client.get("/people/by-slug/nope")).status_code == 404


async def test_people_listed_by_name_case_insensitive(client, db):
    await login(client, db)
    for slug, name in [("charlie", "Charlie"), ("alice", "alice"), ("bob", "Bob")]:
        await client.post("/people", json={"slug": slug, "name": name})

    names = [p["name"] for p in (await client.get("/people")).json()]
    assert names == ["alice", "Bob", "Charlie"]
