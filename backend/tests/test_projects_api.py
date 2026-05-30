import uuid

from app.models.context import Context
from tests.helpers import login


async def test_projects_crud_requires_auth(client):
    assert (await client.get("/projects")).status_code == 401


async def test_projects_crud_flow(client, db):
    await login(client, db)

    ctx = Context(slug="upsun", name="Upsun")
    db.add(ctx)
    await db.flush()

    created = await client.post(
        "/projects", json={"context_id": str(ctx.id), "slug": "dispatch", "title": "Dispatch"}
    )
    assert created.status_code == 201
    pid = created.json()["id"]

    listing = await client.get("/projects")
    assert listing.status_code == 200
    assert any(p["slug"] == "dispatch" for p in listing.json())

    patched = await client.patch(f"/projects/{pid}", json={"title": "Dispatch v2"})
    assert patched.status_code == 200
    assert patched.json()["title"] == "Dispatch v2"

    got = await client.get(f"/projects/{pid}")
    assert got.json()["title"] == "Dispatch v2"

    deleted = await client.delete(f"/projects/{pid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/projects/{pid}")).status_code == 404


async def test_get_missing_project_404(client, db):
    await login(client, db)

    assert (await client.get(f"/projects/{uuid.uuid4()}")).status_code == 404
