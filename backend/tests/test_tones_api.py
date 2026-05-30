import uuid

from tests.helpers import login


async def test_tones_crud_requires_auth(client):
    assert (await client.get("/tones")).status_code == 401


async def test_tones_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/tones",
        json={
            "slug": "warm",
            "name": "Warm",
            "description": "Friendly and approachable.",
            "sample": "Hey there — great to hear from you!",
        },
    )
    assert created.status_code == 201
    tid = created.json()["id"]
    assert created.json()["sample"] == "Hey there — great to hear from you!"

    listing = await client.get("/tones")
    assert listing.status_code == 200
    assert any(t["slug"] == "warm" for t in listing.json())

    patched = await client.patch(f"/tones/{tid}", json={"name": "Warm & Casual"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Warm & Casual"

    got = await client.get(f"/tones/{tid}")
    assert got.json()["name"] == "Warm & Casual"

    deleted = await client.delete(f"/tones/{tid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/tones/{tid}")).status_code == 404


async def test_get_missing_tone_404(client, db):
    await login(client, db)

    assert (await client.get(f"/tones/{uuid.uuid4()}")).status_code == 404
