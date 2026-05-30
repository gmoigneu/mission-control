import uuid

from tests.helpers import login


async def test_knowledge_crud_requires_auth(client):
    assert (await client.get("/knowledge")).status_code == 401


async def test_knowledge_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/knowledge",
        json={"slug": "rust-notes", "title": "Rust Notes", "body": "Ownership and borrowing."},
    )
    assert created.status_code == 201
    kid = created.json()["id"]

    listing = await client.get("/knowledge")
    assert listing.status_code == 200
    assert any(k["slug"] == "rust-notes" for k in listing.json())

    patched = await client.patch(f"/knowledge/{kid}", json={"title": "Rust Notes (v2)"})
    assert patched.status_code == 200
    assert patched.json()["title"] == "Rust Notes (v2)"

    got = await client.get(f"/knowledge/{kid}")
    assert got.json()["title"] == "Rust Notes (v2)"
    assert got.json()["body"] == "Ownership and borrowing."

    deleted = await client.delete(f"/knowledge/{kid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/knowledge/{kid}")).status_code == 404


async def test_get_missing_knowledge_404(client, db):
    await login(client, db)

    assert (await client.get(f"/knowledge/{uuid.uuid4()}")).status_code == 404
