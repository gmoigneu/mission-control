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
