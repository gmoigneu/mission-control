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
