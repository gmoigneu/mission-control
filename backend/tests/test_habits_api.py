import uuid
from datetime import date, timedelta

from tests.helpers import login


async def test_habits_crud_requires_auth(client):
    assert (await client.get("/habits")).status_code == 401


async def test_habits_crud_flow(client, db):
    await login(client, db)

    created = await client.post(
        "/habits", json={"slug": "morning-pages", "name": "Morning pages"}
    )
    assert created.status_code == 201
    body = created.json()
    hid = body["id"]
    assert body["cadence"] == "daily"
    assert body["active"] is True
    assert body["streak"] == 0
    assert body["logged_today"] is False

    listing = await client.get("/habits")
    assert listing.status_code == 200
    assert any(h["slug"] == "morning-pages" for h in listing.json())

    patched = await client.patch(
        f"/habits/{hid}", json={"name": "Morning Pages", "cadence": "weekly"}
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Morning Pages"
    assert patched.json()["cadence"] == "weekly"

    got = await client.get(f"/habits/{hid}")
    assert got.json()["name"] == "Morning Pages"

    deleted = await client.delete(f"/habits/{hid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/habits/{hid}")).status_code == 404


async def test_get_missing_habit_404(client, db):
    await login(client, db)

    assert (await client.get(f"/habits/{uuid.uuid4()}")).status_code == 404


async def test_habit_logs_and_streak(client, db):
    await login(client, db)

    created = await client.post("/habits", json={"slug": "workout", "name": "Workout"})
    hid = created.json()["id"]

    today = date.today()
    # Log today, yesterday and the day before -> streak of 3.
    for offset in (0, 1, 2):
        resp = await client.post(
            f"/habits/{hid}/logs",
            json={"date": (today - timedelta(days=offset)).isoformat(), "done": True},
        )
        assert resp.status_code == 201

    logs = await client.get(f"/habits/{hid}/logs")
    assert logs.status_code == 200
    assert len(logs.json()) == 3

    got = await client.get(f"/habits/{hid}")
    assert got.json()["streak"] == 3
    assert got.json()["logged_today"] is True

    # Re-logging today is idempotent (upsert): still a single row for the day.
    resp = await client.post(
        f"/habits/{hid}/logs", json={"date": today.isoformat(), "done": False}
    )
    assert resp.status_code == 201
    logs = await client.get(f"/habits/{hid}/logs")
    assert len(logs.json()) == 3

    # With today marked not-done, the streak no longer counts today.
    got = await client.get(f"/habits/{hid}")
    assert got.json()["logged_today"] is False
    assert got.json()["streak"] == 2


async def test_habit_logs_missing_habit_404(client, db):
    await login(client, db)

    resp = await client.post(
        f"/habits/{uuid.uuid4()}/logs",
        json={"date": date.today().isoformat(), "done": True},
    )
    assert resp.status_code == 404
