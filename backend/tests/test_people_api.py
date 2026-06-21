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


async def test_people_list_can_search_across_fields(client, db):
    await login(client, db)
    await client.post(
        "/people",
        json={
            "slug": "fabien-potencier",
            "name": "Fabien Potencier",
            "role": "Founder",
            "email": "fabien@example.com",
            "summary": "Symfony creator",
        },
    )
    await client.post(
        "/people",
        json={
            "slug": "alice-engineer",
            "name": "Alice Engineer",
            "role": "Platform lead",
            "email": "alice@example.com",
            "summary": "Works on billing",
        },
    )

    partial_name = await client.get("/people?q=bie")
    assert partial_name.status_code == 200
    assert [p["slug"] for p in partial_name.json()] == ["fabien-potencier"]
    assert partial_name.headers["X-Total-Count"] == "1"

    other_field = await client.get("/people?q=platform")
    assert other_field.status_code == 200
    assert [p["slug"] for p in other_field.json()] == ["alice-engineer"]


async def test_people_list_can_filter_by_company(client, db):
    await login(client, db)
    company = await client.post("/companies", json={"slug": "acme", "name": "Acme"})
    company_id = company.json()["id"]
    await client.post("/people", json={"slug": "ada", "name": "Ada", "company_id": company_id})
    await client.post("/people", json={"slug": "bob", "name": "Bob"})

    listing = await client.get(f"/people?company_id={company_id}")
    assert listing.status_code == 200
    assert [p["slug"] for p in listing.json()] == ["ada"]
    assert listing.headers["X-Total-Count"] == "1"
