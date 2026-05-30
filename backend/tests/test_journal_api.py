import uuid

from sqlalchemy import select

from app.models.audit import AuditLog
from tests.helpers import login


async def test_journal_invalid_mood_returns_422(client, db):
    """Mood/energy are constrained to 1–5 at the boundary."""
    await login(client, db)
    r = await client.post("/journal", json={"date": "2026-01-01", "mood": 9})
    assert r.status_code == 422


async def test_journal_crud_requires_auth(client):
    assert (await client.get("/journal")).status_code == 401


async def test_journal_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/journal",
        json={"date": "2026-05-30", "summary": "Good day", "mood": 4, "energy": 3},
    )
    assert created.status_code == 201
    data = created.json()
    eid = data["id"]
    assert data["date"] == "2026-05-30"
    assert data["mood"] == 4

    listing = await client.get("/journal")
    assert listing.status_code == 200
    assert any(e["date"] == "2026-05-30" for e in listing.json())

    by_date = await client.get("/journal/by-date/2026-05-30")
    assert by_date.status_code == 200
    assert by_date.json()["id"] == eid

    patched = await client.patch(f"/journal/{eid}", json={"summary": "Even better"})
    assert patched.status_code == 200
    assert patched.json()["summary"] == "Even better"

    got = await client.get(f"/journal/{eid}")
    assert got.json()["summary"] == "Even better"

    deleted = await client.delete(f"/journal/{eid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/journal/{eid}")).status_code == 404


async def test_journal_duplicate_date_conflicts(client, db):
    await login(client, db)
    first = await client.post("/journal", json={"date": "2026-02-02"})
    assert first.status_code == 201
    dup = await client.post("/journal", json={"date": "2026-02-02"})
    assert dup.status_code == 409


async def test_journal_logs_flow(client, db):
    await login(client, db)
    entry = await client.post("/journal", json={"date": "2026-03-03"})
    eid = entry.json()["id"]

    log = await client.post(f"/journal/{eid}/logs", json={"text": "Woke up early"})
    assert log.status_code == 201
    lid = log.json()["id"]
    assert log.json()["text"] == "Woke up early"

    logs = await client.get(f"/journal/{eid}/logs")
    assert logs.status_code == 200
    assert any(line["id"] == lid for line in logs.json())

    removed = await client.delete(f"/journal/logs/{lid}")
    assert removed.status_code == 204
    assert all(line["id"] != lid for line in (await client.get(f"/journal/{eid}/logs")).json())


async def test_journal_create_writes_audit_row(client, db):
    await login(client, db)
    created = await client.post("/journal", json={"date": "2026-04-04"})
    eid = created.json()["id"]

    rows = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "journal_entry",
                AuditLog.action == "create",
            )
        )
    ).scalars().all()
    assert any(str(r.entity_id) == eid for r in rows)


async def test_journal_create_is_revertible_via_activity(client, db):
    await login(client, db)
    created = await client.post("/journal", json={"date": "2026-06-06"})
    eid = created.json()["id"]

    entries = (await client.get("/audit")).json()
    audit_id = next(
        e["id"]
        for e in entries
        if e["entity_type"] == "journal_entry" and e["action"] == "create"
    )

    revert = await client.post(f"/audit/{audit_id}/revert")
    assert revert.status_code == 200
    assert revert.json()["reverted"] is True
    assert (await client.get(f"/journal/{eid}")).status_code == 404


async def test_get_missing_journal_entry_404(client, db):
    await login(client, db)
    assert (await client.get(f"/journal/{uuid.uuid4()}")).status_code == 404
