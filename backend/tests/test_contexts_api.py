from app.models.user import AppUser
from app.security import hash_password


async def _login(client, db):
    db.add(AppUser(email="g@example.com", password_hash=hash_password("pw")))
    await db.flush()
    r = await client.post("/auth/login", json={"email": "g@example.com", "password": "pw"})
    assert r.status_code == 200


async def test_contexts_crud_requires_auth(client):
    assert (await client.get("/contexts")).status_code == 401


async def test_contexts_crud_flow(client, db):
    await _login(client, db)

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
    await _login(client, db)
    import uuid

    assert (await client.get(f"/contexts/{uuid.uuid4()}")).status_code == 404
