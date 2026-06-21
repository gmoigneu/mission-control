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
    assert body["tracking_type"] == "boolean"
    assert body["active"] is True
    assert body["streak"] == 0
    assert body["logged_today"] is False
    assert body["today_score"] is None

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


async def test_habits_list_pagination_headers(client, db):
    await login(client, db)

    for i in range(3):
        created = await client.post(
            "/habits", json={"slug": f"paged-habit-{i}", "name": f"Paged Habit {i}"}
        )
        assert created.status_code == 201
    inactive = await client.post(
        "/habits", json={"slug": "paged-habit-inactive", "name": "Inactive", "active": False}
    )
    assert inactive.status_code == 201

    first = await client.get("/habits?active=true&limit=2&offset=0")
    assert first.status_code == 200
    assert len(first.json()) == 2
    assert first.headers["X-Total-Count"] == "3"
    assert first.headers["X-Limit"] == "2"
    assert first.headers["X-Offset"] == "0"
    assert first.headers["X-Next-Offset"] == "2"

    last = await client.get("/habits?active=true&limit=2&offset=2")
    assert last.status_code == 200
    assert len(last.json()) == 1
    assert "X-Next-Offset" not in last.headers


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

    score_habit = await client.post(
        "/habits", json={"slug": "focus-score", "name": "Focus score", "tracking_type": "score"}
    )
    score_id = score_habit.json()["id"]
    await client.post(
        f"/habits/{score_id}/logs", json={"date": today.isoformat(), "score": 4}
    )
    got_score = await client.get(f"/habits/{score_id}")
    assert got_score.json()["logged_today"] is True
    assert got_score.json()["today_score"] == 4


async def test_habits_list_includes_stats(client, db):
    await login(client, db)

    today = date.today()
    boolean_habit = await client.post(
        "/habits", json={"slug": "list-stats-boolean", "name": "List stats boolean"}
    )
    boolean_id = boolean_habit.json()["id"]
    for offset in (0, 1):
        resp = await client.post(
            f"/habits/{boolean_id}/logs",
            json={"date": (today - timedelta(days=offset)).isoformat(), "done": True},
        )
        assert resp.status_code == 201

    score_habit = await client.post(
        "/habits",
        json={
            "slug": "list-stats-score",
            "name": "List stats score",
            "tracking_type": "score",
        },
    )
    score_id = score_habit.json()["id"]
    resp = await client.post(
        f"/habits/{score_id}/logs", json={"date": today.isoformat(), "score": 5}
    )
    assert resp.status_code == 201

    listing = await client.get("/habits")
    assert listing.status_code == 200
    rows = {row["id"]: row for row in listing.json()}
    assert rows[boolean_id]["streak"] == 2
    assert rows[boolean_id]["logged_today"] is True
    assert rows[boolean_id]["today_score"] is None
    assert rows[score_id]["streak"] == 1
    assert rows[score_id]["logged_today"] is True
    assert rows[score_id]["today_score"] == 5


async def test_score_habit_logs_and_history(client, db):
    await login(client, db)

    created = await client.post(
        "/habits",
        json={"slug": "sleep-quality", "name": "Sleep quality", "tracking_type": "score"},
    )
    assert created.status_code == 201
    hid = created.json()["id"]
    assert created.json()["tracking_type"] == "score"

    logged = await client.post(
        f"/habits/{hid}/logs",
        json={"date": "2026-06-20", "score": 4},
    )
    assert logged.status_code == 201
    assert logged.json()["score"] == 4
    assert logged.json()["done"] is True

    patched = await client.post(
        f"/habits/{hid}/logs",
        json={"date": "2026-06-20", "score": 2},
    )
    assert patched.status_code == 201
    assert patched.json()["score"] == 2

    history = await client.get("/habits/logs", params={"days": 3, "end": "2026-06-21"})
    assert history.status_code == 200
    assert any(
        row["habit_id"] == hid and row["date"] == "2026-06-20" and row["score"] == 2
        for row in history.json()
    )


async def test_score_habit_rejects_out_of_range_score(client, db):
    await login(client, db)

    created = await client.post(
        "/habits",
        json={"slug": "focus-depth", "name": "Focus depth", "tracking_type": "score"},
    )

    resp = await client.post(
        f"/habits/{created.json()['id']}/logs",
        json={"date": "2026-06-20", "score": 6},
    )

    assert resp.status_code == 422


async def test_habit_logs_missing_habit_404(client, db):
    await login(client, db)

    resp = await client.post(
        f"/habits/{uuid.uuid4()}/logs",
        json={"date": date.today().isoformat(), "done": True},
    )
    assert resp.status_code == 404
