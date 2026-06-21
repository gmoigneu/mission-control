from tests.helpers import login


async def test_daily_checkins_require_auth(client):
    assert (await client.get("/daily-checkins")).status_code == 401


async def test_daily_checkin_upsert_and_history(client, db):
    await login(client, db)

    saved = await client.put(
        "/daily-checkins/2026-06-20",
        json={"mood": 4, "energy": 2, "productivity": 5},
    )

    assert saved.status_code == 200
    data = saved.json()
    assert data["date"] == "2026-06-20"
    assert data["mood"] == 4
    assert data["energy"] == 2
    assert data["productivity"] == 5

    patched = await client.put(
        "/daily-checkins/2026-06-20",
        json={"energy": 3},
    )
    assert patched.status_code == 200
    assert patched.json()["mood"] == 4
    assert patched.json()["energy"] == 3
    assert patched.json()["productivity"] == 5

    history = await client.get("/daily-checkins", params={"days": 3, "end": "2026-06-21"})
    assert history.status_code == 200
    assert history.json() == [
        {
            "id": None,
            "date": "2026-06-19",
            "mood": None,
            "energy": None,
            "productivity": None,
            "updated_at": None,
        },
        {
            "id": data["id"],
            "date": "2026-06-20",
            "mood": 4,
            "energy": 3,
            "productivity": 5,
            "updated_at": patched.json()["updated_at"],
        },
        {
            "id": None,
            "date": "2026-06-21",
            "mood": None,
            "energy": None,
            "productivity": None,
            "updated_at": None,
        },
    ]


async def test_daily_checkin_rejects_scores_outside_one_to_five(client, db):
    await login(client, db)

    low = await client.put("/daily-checkins/2026-06-20", json={"mood": 0})
    high = await client.put("/daily-checkins/2026-06-20", json={"productivity": 6})

    assert low.status_code == 422
    assert high.status_code == 422
