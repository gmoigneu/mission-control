from datetime import UTC, datetime, timedelta

import pytest

from tests.helpers import login


@pytest.mark.asyncio(loop_scope="session")
async def test_records_useful_feedback_with_source_run(client, db):
    await login(client, db, email="pref-useful@example.com", password="pw")
    run_id = "11111111-1111-4111-8111-111111111111"

    resp = await client.post(
        "/proactive-preferences/feedback",
        json={
            "action": "useful",
            "source_proactive_run_id": run_id,
            "routine_type": "daily_planning",
            "trigger_ref": "morning-plan",
        },
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["preference_type"] == "useful"
    assert body["user_id"]
    assert body["scope"] == "trigger"
    assert body["source_proactive_run_id"] == run_id
    assert body["requires_confirmation"] is False
    assert body["active"] is True


@pytest.mark.asyncio(loop_scope="session")
async def test_mute_routine_blocks_matching_future_policy(client, db):
    await login(client, db, email="pref-routine@example.com", password="pw")

    resp = await client.post(
        "/proactive-preferences/feedback",
        json={"action": "mute_routine", "routine_type": "weekly_review"},
    )
    assert resp.status_code == 201, resp.text

    blocked = await client.post(
        "/proactive-preferences/evaluate",
        json={"routine_type": "weekly_review", "trigger_ref": "review-start"},
    )
    assert blocked.status_code == 200, blocked.text
    assert blocked.json()["allowed"] is False
    assert "mute_routine" in blocked.json()["reasons"]

    unrelated = await client.post(
        "/proactive-preferences/evaluate",
        json={"routine_type": "daily_planning", "trigger_ref": "morning"},
    )
    assert unrelated.status_code == 200, unrelated.text
    assert unrelated.json()["allowed"] is True


@pytest.mark.asyncio(loop_scope="session")
async def test_entity_mute_and_remind_later_affect_policy(client, db):
    await login(client, db, email="pref-entity@example.com", password="pw")
    remind_until = datetime.now(UTC) + timedelta(hours=2)

    muted = await client.post(
        "/proactive-preferences/feedback",
        json={
            "action": "mute_entity_topic",
            "entity_type": "project",
            "entity_ref": "launch",
        },
    )
    assert muted.status_code == 201, muted.text

    reminder = await client.post(
        "/proactive-preferences/feedback",
        json={
            "action": "remind_later",
            "routine_type": "daily_planning",
            "trigger_ref": "standup",
            "remind_until": remind_until.isoformat(),
        },
    )
    assert reminder.status_code == 201, reminder.text

    entity_decision = await client.post(
        "/proactive-preferences/evaluate",
        json={"entity_type": "project", "entity_ref": "launch"},
    )
    assert entity_decision.json()["allowed"] is False
    assert "mute_entity_topic" in entity_decision.json()["reasons"]

    reminder_decision = await client.post(
        "/proactive-preferences/evaluate",
        json={"routine_type": "daily_planning", "trigger_ref": "standup"},
    )
    assert reminder_decision.json()["allowed"] is False
    assert "remind_later" in reminder_decision.json()["reasons"]


@pytest.mark.asyncio(loop_scope="session")
async def test_broad_changes_require_confirmation(client, db):
    await login(client, db, email="pref-confirm@example.com", password="pw")

    rejected = await client.post(
        "/proactive-preferences/feedback",
        json={
            "action": "change_channel",
            "routine_type": "daily_planning",
            "channel": "telegram",
        },
    )
    assert rejected.status_code == 409

    accepted = await client.post(
        "/proactive-preferences/feedback",
        json={
            "action": "change_channel",
            "routine_type": "daily_planning",
            "channel": "telegram",
            "confirmed": True,
        },
    )
    assert accepted.status_code == 201, accepted.text
    assert accepted.json()["requires_confirmation"] is True

    decision = await client.post(
        "/proactive-preferences/evaluate",
        json={"routine_type": "daily_planning", "channel": "in_app"},
    )
    assert decision.status_code == 200, decision.text
    assert decision.json()["allowed"] is True
    assert decision.json()["channel"] == "telegram"


@pytest.mark.asyncio(loop_scope="session")
async def test_most_recent_channel_preference_wins(client, db):
    await login(client, db, email="pref-channel-order@example.com", password="pw")

    old = await client.post(
        "/proactive-preferences/feedback",
        json={"action": "change_channel", "channel": "email", "confirmed": True},
    )
    assert old.status_code == 201, old.text
    new = await client.post(
        "/proactive-preferences/feedback",
        json={"action": "change_channel", "channel": "telegram", "confirmed": True},
    )
    assert new.status_code == 201, new.text

    decision = await client.post(
        "/proactive-preferences/evaluate",
        json={"routine_type": "daily_planning", "channel": "in_app"},
    )

    assert decision.status_code == 200, decision.text
    assert decision.json()["channel"] == "telegram"


@pytest.mark.asyncio(loop_scope="session")
async def test_learned_preference_can_be_disabled(client, db):
    await login(client, db, email="pref-disable@example.com", password="pw")

    created = await client.post(
        "/proactive-preferences/feedback",
        json={"action": "do_not_show_again", "trigger_ref": "repeat-warning"},
    )
    assert created.status_code == 201, created.text
    pref_id = created.json()["id"]

    before = await client.post(
        "/proactive-preferences/evaluate",
        json={"trigger_ref": "repeat-warning"},
    )
    assert before.json()["allowed"] is False

    patched = await client.patch(f"/proactive-preferences/{pref_id}", json={"active": False})
    assert patched.status_code == 200, patched.text
    assert patched.json()["active"] is False

    after = await client.post(
        "/proactive-preferences/evaluate",
        json={"trigger_ref": "repeat-warning"},
    )
    assert after.json()["allowed"] is True


@pytest.mark.asyncio(loop_scope="session")
async def test_do_not_show_again_requires_trigger_ref(client, db):
    await login(client, db, email="pref-no-trigger@example.com", password="pw")

    created = await client.post(
        "/proactive-preferences/feedback",
        json={"action": "do_not_show_again"},
    )

    assert created.status_code == 422


@pytest.mark.asyncio(loop_scope="session")
async def test_preferences_are_scoped_to_current_user(client, db):
    await login(client, db, email="pref-owner@example.com", password="pw")
    created = await client.post(
        "/proactive-preferences/feedback",
        json={"action": "do_not_show_again", "trigger_ref": "private-trigger"},
    )
    assert created.status_code == 201, created.text

    owner_decision = await client.post(
        "/proactive-preferences/evaluate",
        json={"trigger_ref": "private-trigger"},
    )
    assert owner_decision.json()["allowed"] is False

    await login(client, db, email="pref-other@example.com", password="pw")
    other_list = await client.get("/proactive-preferences")
    assert other_list.status_code == 200
    assert other_list.json() == []

    other_decision = await client.post(
        "/proactive-preferences/evaluate",
        json={"trigger_ref": "private-trigger"},
    )
    assert other_decision.json()["allowed"] is True


@pytest.mark.asyncio(loop_scope="session")
async def test_expired_and_invalid_reminders_are_not_reported_as_matches(client, db):
    await login(client, db, email="pref-expired@example.com", password="pw")
    expired = datetime.now(UTC) - timedelta(hours=1)
    created = await client.post(
        "/proactive-preferences/feedback",
        json={
            "action": "remind_later",
            "trigger_ref": "expired-reminder",
            "remind_until": expired.isoformat(),
        },
    )
    assert created.status_code == 201, created.text

    decision = await client.post(
        "/proactive-preferences/evaluate",
        json={"trigger_ref": "expired-reminder"},
    )
    body = decision.json()
    assert body["allowed"] is True
    assert body["matched_preference_ids"] == []


@pytest.mark.asyncio(loop_scope="session")
async def test_less_like_this_reduces_frequency_without_blocking(client, db):
    await login(client, db, email="pref-less@example.com", password="pw")
    created = await client.post(
        "/proactive-preferences/feedback",
        json={"action": "less_like_this", "trigger_ref": "soft-signal"},
    )
    assert created.status_code == 201, created.text

    decision = await client.post(
        "/proactive-preferences/evaluate",
        json={"trigger_ref": "soft-signal"},
    )
    body = decision.json()
    assert body["allowed"] is True
    assert body["frequency"] == "less"
    assert "less_like_this" in body["reasons"]
    assert body["matched_preference_ids"] == [created.json()["id"]]


@pytest.mark.asyncio(loop_scope="session")
async def test_never_at_this_time_uses_timezone_and_window(client, db):
    await login(client, db, email="pref-timezone@example.com", password="pw")

    created = await client.post(
        "/proactive-preferences/feedback",
        json={
            "action": "never_at_this_time",
            "routine_type": "daily_planning",
            "never_at_time": "10:00",
            "timezone_offset_minutes": -120,
        },
    )
    assert created.status_code == 201, created.text

    blocked = await client.post(
        "/proactive-preferences/evaluate",
        json={
            "routine_type": "daily_planning",
            "at": "2026-06-22T08:30:00Z",
        },
    )
    assert blocked.status_code == 200, blocked.text
    assert blocked.json()["allowed"] is False
    assert "never_at_this_time" in blocked.json()["reasons"]

    allowed = await client.post(
        "/proactive-preferences/evaluate",
        json={
            "routine_type": "daily_planning",
            "at": "2026-06-22T13:30:00Z",
        },
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["allowed"] is True


@pytest.mark.asyncio(loop_scope="session")
async def test_preferences_list_is_bounded(client, db):
    await login(client, db, email="pref-list-bound@example.com", password="pw")

    too_large = await client.get("/proactive-preferences?limit=9999")
    assert too_large.status_code == 422
