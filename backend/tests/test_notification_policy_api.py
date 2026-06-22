import pytest

from tests.helpers import login


@pytest.mark.asyncio(loop_scope="session")
async def test_get_notification_policy_returns_defaults(client, db):
    await login(client, db, email="policy-get@example.com", password="pw")

    resp = await client.get("/agent/notification-policy")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["enabled"] is True
    assert body["quiet_hours"]["start"] == "22:00"
    assert body["routines"]["daily_planning"]["enabled"] is True
    assert body["routines"]["daily_planning"]["channel"] == "in_app"


@pytest.mark.asyncio(loop_scope="session")
async def test_put_notification_policy_persists_to_user_settings(client, db):
    await login(client, db, email="policy-put@example.com", password="pw")

    resp = await client.put(
        "/agent/notification-policy",
        json={
            "enabled": False,
            "default_channel": "both",
            "routines": {
                "task_drift": {
                    "enabled": False,
                    "channel": "none",
                    "max_per_day": 1,
                    "cooldown_minutes": 240,
                }
            },
        },
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["enabled"] is False
    assert body["default_channel"] == "both"
    assert body["routines"]["task_drift"]["enabled"] is False
    assert body["routines"]["task_drift"]["channel"] == "none"
    assert body["routines"]["task_drift"]["max_per_day"] == 1
    assert body["routines"]["task_drift"]["cooldown_minutes"] == 240

    again = await client.get("/agent/notification-policy")
    assert again.status_code == 200, again.text
    assert again.json()["enabled"] is False


@pytest.mark.asyncio(loop_scope="session")
async def test_put_notification_policy_rejects_invalid_quiet_hours(client, db):
    await login(client, db, email="policy-invalid-time@example.com", password="pw")

    resp = await client.put(
        "/agent/notification-policy",
        json={"quiet_hours": {"start": "25:00", "end": "07:00"}},
    )

    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio(loop_scope="session")
async def test_evaluate_notification_policy_blocks_quiet_hours(client, db):
    await login(client, db, email="policy-eval@example.com", password="pw")

    resp = await client.post(
        "/agent/notification-policy/evaluate",
        json={
            "routine": "daily_planning",
            "urgency": "normal",
            "now": "2026-06-22T23:30:00Z",
        },
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["allowed"] is False
    assert body["channels"] == []
    assert "quiet_hours" in body["reasons"]


@pytest.mark.asyncio(loop_scope="session")
async def test_evaluate_notification_policy_accepts_naive_datetimes(client, db):
    await login(client, db, email="policy-naive@example.com", password="pw")

    resp = await client.post(
        "/agent/notification-policy/evaluate",
        json={
            "routine": "daily_planning",
            "urgency": "normal",
            "now": "2026-06-22T14:00:00",
            "last_sent_at": "2026-06-22T13:30:00",
        },
    )

    assert resp.status_code == 200, resp.text
    assert "cooldown" in resp.json()["reasons"]
