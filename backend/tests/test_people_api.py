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


async def test_people_limit_offset_pagination(client, db):
    """#15 — limit/offset paginate people and X-Total-Count reports the total."""
    await login(client, db)

    for i in range(5):
        created = await client.post(
            "/people", json={"slug": f"person-page-{i}", "name": f"PersonPage{i}"}
        )
        assert created.status_code == 201

    full = await client.get("/people?limit=200")
    assert full.status_code == 200
    total = int(full.headers["X-Total-Count"])
    assert total >= 5
    ids = [row["id"] for row in full.json()]

    page1 = await client.get("/people?limit=2&offset=0")
    assert page1.status_code == 200
    assert len(page1.json()) == 2
    assert int(page1.headers["X-Total-Count"]) == total
    assert [row["id"] for row in page1.json()] == ids[:2]

    page2 = await client.get("/people?limit=2&offset=2")
    assert page2.status_code == 200
    assert [row["id"] for row in page2.json()] == ids[2:4]


async def test_people_limit_bounds(client, db):
    """#15 — limit is capped at 200 and offset must be non-negative."""
    await login(client, db)
    assert (await client.get("/people?limit=9999")).status_code == 422
    assert (await client.get("/people?offset=-1")).status_code == 422
