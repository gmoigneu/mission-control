import uuid

from tests.helpers import login


async def test_companies_crud_requires_auth(client):
    assert (await client.get("/companies")).status_code == 401


async def test_companies_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/companies", json={"slug": "acme", "name": "Acme"}
    )
    assert created.status_code == 201
    cid = created.json()["id"]

    listing = await client.get("/companies")
    assert listing.status_code == 200
    assert any(c["slug"] == "acme" for c in listing.json())

    patched = await client.patch(f"/companies/{cid}", json={"name": "Acme Corp"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Acme Corp"

    got = await client.get(f"/companies/{cid}")
    assert got.json()["name"] == "Acme Corp"

    deleted = await client.delete(f"/companies/{cid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/companies/{cid}")).status_code == 404


async def test_get_missing_company_404(client, db):
    await login(client, db)

    assert (await client.get(f"/companies/{uuid.uuid4()}")).status_code == 404


async def test_get_company_by_slug(client, db):
    await login(client, db)
    await client.post("/companies", json={"slug": "acme", "name": "Acme"})

    found = await client.get("/companies/by-slug/acme")
    assert found.status_code == 200
    assert found.json()["name"] == "Acme"

    assert (await client.get("/companies/by-slug/nope")).status_code == 404


async def test_companies_list_can_search_across_fields(client, db):
    await login(client, db)
    await client.post(
        "/companies",
        json={
            "slug": "upstream",
            "name": "Upstream",
            "domain": "upstream.example",
            "notes": "Open source hosting platform",
        },
    )
    await client.post(
        "/companies",
        json={
            "slug": "acme",
            "name": "Acme",
            "domain": "acme.example",
            "notes": "Industrial supplies",
        },
    )

    domain = await client.get("/companies?q=upstream.example")
    assert domain.status_code == 200
    assert [c["slug"] for c in domain.json()] == ["upstream"]
    assert domain.headers["X-Total-Count"] == "1"

    notes = await client.get("/companies?q=industrial")
    assert notes.status_code == 200
    assert [c["slug"] for c in notes.json()] == ["acme"]
