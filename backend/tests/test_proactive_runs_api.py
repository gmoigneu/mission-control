import uuid

from sqlalchemy import select

from app.models.proactive_run import ProactiveRun
from app.models.user import AppUser
from app.schemas.proactive_run import ProactiveRunCreate, ProactiveRunUpdate
from app.services.proactive_run import create_proactive_run, update_proactive_run
from tests.helpers import login


def proactive_payload() -> dict:
    entity_id = str(uuid.uuid4())
    return {
        "routine_type": "daily_planning",
        "routine_name": "Daily planning nudge",
        "trigger_reason": "Daily planning is enabled and quiet hours ended.",
        "trigger_data_summary": "No plan exists for today; three open tasks are due.",
        "related_entities": [{"entity_type": "task", "entity_id": entity_id, "label": "Ship v2"}],
        "policy_decision": "sent",
        "channels": ["app", "telegram"],
        "message_title": "Plan today",
        "message_summary": "Aya suggested planning around overdue tasks.",
        "message_body": "Want to plan the day before meetings start?",
        "delivery_status": {"app": "delivered", "telegram": "queued"},
        "outcome": "sent",
        "audit_log_ids": [str(uuid.uuid4())],
    }


async def test_service_creates_and_updates_proactive_run(db):
    user = AppUser(email="run-service@example.com")
    db.add(user)
    await db.flush()
    obj = await create_proactive_run(
        db, user_id=user.id, data=ProactiveRunCreate(**proactive_payload())
    )
    await db.flush()

    assert obj.id is not None
    assert obj.user_id == user.id
    assert obj.routine_type == "daily_planning"
    assert obj.related_entities[0]["label"] == "Ship v2"

    await update_proactive_run(
        db,
        obj,
        ProactiveRunUpdate(delivery_status={"app": "opened"}, outcome="opened"),
    )
    await db.flush()

    saved = (await db.execute(select(ProactiveRun).where(ProactiveRun.id == obj.id))).scalar_one()
    assert saved.delivery_status == {"app": "opened"}
    assert saved.outcome == "opened"


async def test_proactive_run_api_lists_filters_and_dismisses(client, db):
    await login(client, db, email="run-owner@example.com")
    user = (
        await db.execute(select(AppUser).where(AppUser.email == "run-owner@example.com"))
    ).scalar_one()

    created = await create_proactive_run(
        db, user_id=user.id, data=ProactiveRunCreate(**proactive_payload())
    )
    await db.commit()
    run_id = created.id

    listed = await client.get("/proactive-runs?routine_type=daily_planning")
    assert listed.status_code == 200
    assert listed.headers["x-total-count"] == "1"
    assert listed.json()[0]["trigger_reason"].startswith("Daily planning")

    updated = await client.patch(
        f"/proactive-runs/{run_id}",
        json={"delivery_status": {"app": "delivered", "telegram": "delivered"}, "outcome": "acted"},
    )
    assert updated.status_code == 200
    assert updated.json()["outcome"] == "acted"
    assert updated.json()["delivery_status"]["telegram"] == "delivered"

    dismissed = await client.post(f"/proactive-runs/{run_id}/dismiss")
    assert dismissed.status_code == 200
    assert dismissed.json()["outcome"] == "dismissed"
    assert dismissed.json()["dismissed_at"] is not None


async def test_proactive_run_api_filters_by_authenticated_user(client, db):
    await login(client, db, email="run-other@example.com")
    other = (
        await db.execute(select(AppUser).where(AppUser.email == "run-other@example.com"))
    ).scalar_one()
    owner = AppUser(email="run-owner-hidden@example.com", password_hash="x")
    db.add(owner)
    await db.flush()
    hidden = await create_proactive_run(
        db, user_id=owner.id, data=ProactiveRunCreate(**proactive_payload())
    )
    visible = await create_proactive_run(
        db,
        user_id=other.id,
        data=ProactiveRunCreate(
            **{**proactive_payload(), "routine_type": "task_drift", "routine_name": "Task drift"}
        ),
    )
    await db.commit()

    listed = await client.get("/proactive-runs")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [str(visible.id)]

    read_hidden = await client.get(f"/proactive-runs/{hidden.id}")
    assert read_hidden.status_code == 404

    mute_hidden = await client.post(f"/proactive-runs/{hidden.id}/mute")
    assert mute_hidden.status_code == 404
