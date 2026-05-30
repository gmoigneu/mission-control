import uuid

from tests.helpers import login


async def test_journal_entries_crud_requires_auth(client):
    assert (await client.get("/journal-entries")).status_code == 401


async def test_journal_entries_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/journal-entries",
        json={
            "date": "2026-05-29",
            "title": "Friday",
            "body": "Shipped the journal feature.",
            "mood": 4,
            "energy": 3,
        },
    )
    assert created.status_code == 201
    data = created.json()
    jid = data["id"]
    assert data["body"] == "Shipped the journal feature."
    assert data["title"] == "Friday"
    assert data["date"] == "2026-05-29"
    assert data["mood"] == 4
    assert data["energy"] == 3

    listing = await client.get("/journal-entries")
    assert listing.status_code == 200
    assert any(j["id"] == jid for j in listing.json())

    patched = await client.patch(
        f"/journal-entries/{jid}", json={"body": "Shipped it and wrote tests.", "mood": 5}
    )
    assert patched.status_code == 200
    assert patched.json()["body"] == "Shipped it and wrote tests."
    assert patched.json()["mood"] == 5

    got = await client.get(f"/journal-entries/{jid}")
    assert got.json()["body"] == "Shipped it and wrote tests."

    deleted = await client.delete(f"/journal-entries/{jid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/journal-entries/{jid}")).status_code == 404


async def test_journal_entry_minimal_payload(client, db):
    await login(client, db)

    created = await client.post(
        "/journal-entries",
        json={"date": "2026-01-02", "body": "Quiet day."},
    )
    assert created.status_code == 201
    data = created.json()
    assert data["title"] is None
    assert data["mood"] is None
    assert data["energy"] is None


async def test_get_missing_journal_entry_404(client, db):
    await login(client, db)

    assert (await client.get(f"/journal-entries/{uuid.uuid4()}")).status_code == 404
