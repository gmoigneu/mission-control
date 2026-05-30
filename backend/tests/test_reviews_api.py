import uuid

from tests.helpers import login


async def test_reviews_crud_requires_auth(client):
    assert (await client.get("/reviews")).status_code == 401


async def test_reviews_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/reviews",
        json={"period": "weekly", "date": "2026-05-25", "title": "Week 21 review"},
    )
    assert created.status_code == 201
    rid = created.json()["id"]

    listing = await client.get("/reviews")
    assert listing.status_code == 200
    assert any(r["title"] == "Week 21 review" for r in listing.json())

    patched = await client.patch(
        f"/reviews/{rid}", json={"highlights": "Shipped the importer"}
    )
    assert patched.status_code == 200
    assert patched.json()["highlights"] == "Shipped the importer"

    got = await client.get(f"/reviews/{rid}")
    assert got.json()["period"] == "weekly"

    deleted = await client.delete(f"/reviews/{rid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/reviews/{rid}")).status_code == 404


async def test_get_missing_review_404(client, db):
    await login(client, db)

    assert (await client.get(f"/reviews/{uuid.uuid4()}")).status_code == 404
