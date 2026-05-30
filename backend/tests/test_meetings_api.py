import uuid

from tests.helpers import login


async def test_meetings_crud_requires_auth(client):
    assert (await client.get("/meetings")).status_code == 401


async def test_meetings_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/meetings",
        json={"slug": "kickoff", "title": "Kickoff", "at": "2026-01-01T10:00:00Z"},
    )
    assert created.status_code == 201
    mid = created.json()["id"]

    listing = await client.get("/meetings")
    assert listing.status_code == 200
    assert any(m["slug"] == "kickoff" for m in listing.json())

    patched = await client.patch(f"/meetings/{mid}", json={"title": "Kickoff Call"})
    assert patched.status_code == 200
    assert patched.json()["title"] == "Kickoff Call"

    got = await client.get(f"/meetings/{mid}")
    assert got.json()["title"] == "Kickoff Call"

    deleted = await client.delete(f"/meetings/{mid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/meetings/{mid}")).status_code == 404


async def test_get_missing_meeting_404(client, db):
    await login(client, db)

    assert (await client.get(f"/meetings/{uuid.uuid4()}")).status_code == 404
