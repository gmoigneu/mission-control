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
            "productivity": 5,
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
    assert data["productivity"] == 5

    listing = await client.get("/journal-entries")
    assert listing.status_code == 200
    assert any(j["id"] == jid for j in listing.json())

    patched = await client.patch(
        f"/journal-entries/{jid}",
        json={"body": "Shipped it and wrote tests.", "mood": 5, "productivity": 4},
    )
    assert patched.status_code == 200
    assert patched.json()["body"] == "Shipped it and wrote tests."
    assert patched.json()["mood"] == 5
    assert patched.json()["productivity"] == 4

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
    assert data["productivity"] is None


async def test_journal_entries_list_pagination_headers(client, db):
    await login(client, db)

    for i, day in enumerate(["2026-02-01", "2026-02-02", "2026-02-03"]):
        created = await client.post(
            "/journal-entries",
            json={"date": day, "body": f"Paged journal {i}"},
        )
        assert created.status_code == 201

    first = await client.get("/journal-entries?limit=2&offset=0")
    assert first.status_code == 200
    assert len(first.json()) == 2
    assert first.headers["X-Total-Count"] == "3"
    assert first.headers["X-Limit"] == "2"
    assert first.headers["X-Offset"] == "0"
    assert first.headers["X-Next-Offset"] == "2"

    last = await client.get("/journal-entries?limit=2&offset=2")
    assert last.status_code == 200
    assert len(last.json()) == 1
    assert "X-Next-Offset" not in last.headers


async def test_get_missing_journal_entry_404(client, db):
    await login(client, db)

    assert (await client.get(f"/journal-entries/{uuid.uuid4()}")).status_code == 404
