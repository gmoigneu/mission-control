import uuid
from datetime import date, timedelta

from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.outbox import OutboxEvent
from app.models.task import Task
from tests.helpers import login


async def test_tasks_invalid_status_returns_422(client, db):
    """I9 — enum validation rejects unknown status values at the boundary."""
    await login(client, db)
    r = await client.post("/tasks", json={"title": "Bad Status Task", "status": "potato"})
    assert r.status_code == 422


async def test_tasks_crud_requires_auth(client):
    assert (await client.get("/tasks")).status_code == 401


async def test_tasks_crud_flow(client, db):
    await login(client, db)

    created = await client.post("/tasks", json={"title": "Ship P1"})
    assert created.status_code == 201
    data = created.json()
    tid = data["id"]
    assert data["status"] == "open"
    assert data["priority"] == "normal"

    listing = await client.get("/tasks")
    assert listing.status_code == 200
    assert any(t["title"] == "Ship P1" for t in listing.json())

    patched = await client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
    assert patched.status_code == 200
    assert patched.json()["status"] == "in_progress"

    got = await client.get(f"/tasks/{tid}")
    assert got.json()["status"] == "in_progress"

    deleted = await client.delete(f"/tasks/{tid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/tasks/{tid}")).status_code == 404


async def test_get_missing_task_404(client, db):
    await login(client, db)

    assert (await client.get(f"/tasks/{uuid.uuid4()}")).status_code == 404


async def test_create_recurring_weekly_task_creates_first_scheduled_instance(client, db):
    await login(client, db)

    created = await client.post(
        "/tasks",
        json={
            "title": "Plan the week",
            "priority": "high",
            "due": "2026-07-10",
            "scheduled": "2026-07-10",
            "recurrence": {
                "frequency": "weekly",
                "start_date": "2026-07-08",
                "weekday": 0,
            },
        },
    )

    assert created.status_code == 201
    data = created.json()
    assert data["title"] == "Plan the week"
    assert data["status"] == "open"
    assert data["priority"] == "high"
    assert data["scheduled"] == "2026-07-13"
    assert data["due"] is None
    assert data["recurrence_id"] is not None
    assert data["recurrence"]["frequency"] == "weekly"
    assert data["recurrence"]["weekday"] == 0


async def test_completing_recurring_task_generates_next_instance(client, db):
    await login(client, db)
    today = date.today()

    created = await client.post(
        "/tasks",
        json={
            "title": "Daily check",
            "body": "Use the checklist",
            "recurrence": {"frequency": "daily", "start_date": today.isoformat()},
        },
    )
    assert created.status_code == 201
    task = created.json()

    patched = await client.patch(f"/tasks/{task['id']}", json={"status": "done"})
    assert patched.status_code == 200
    assert patched.json()["completed_at"] is not None

    listing = await client.get("/tasks")
    assert listing.status_code == 200
    generated = [
        item
        for item in listing.json()
        if item["recurrence_id"] == task["recurrence_id"] and item["id"] != task["id"]
    ]
    assert len(generated) == 1
    assert generated[0]["title"] == "Daily check"
    assert generated[0]["body"] == "Use the checklist"
    assert generated[0]["status"] == "open"
    assert generated[0]["scheduled"] == (today + timedelta(days=1)).isoformat()
    assert generated[0]["due"] is None

    # Re-saving the already completed task should not duplicate the next instance.
    patched_again = await client.patch(f"/tasks/{task['id']}", json={"status": "done"})
    assert patched_again.status_code == 200
    listing_again = await client.get("/tasks")
    generated_again = [
        item
        for item in listing_again.json()
        if item["recurrence_id"] == task["recurrence_id"] and item["id"] != task["id"]
    ]
    assert len(generated_again) == 1


async def test_monthly_recurrence_clamps_missing_day_to_last_day(client, db):
    await login(client, db)

    created = await client.post(
        "/tasks",
        json={
            "title": "Month end",
            "recurrence": {
                "frequency": "monthly",
                "start_date": "2026-02-01",
                "month_day": 31,
            },
        },
    )

    assert created.status_code == 201
    data = created.json()
    assert data["scheduled"] == "2026-02-28"
    assert data["recurrence"]["month_day"] == 31


async def test_disabling_recurrence_stops_future_generation(client, db):
    await login(client, db)
    today = date.today()

    created = await client.post(
        "/tasks",
        json={
            "title": "No more repeats",
            "recurrence": {"frequency": "daily", "start_date": today.isoformat()},
        },
    )
    assert created.status_code == 201
    task = created.json()

    disabled = await client.post(f"/task-recurrences/{task['recurrence_id']}/disable")
    assert disabled.status_code == 200
    assert disabled.json()["active"] is False

    patched = await client.patch(f"/tasks/{task['id']}", json={"status": "done"})
    assert patched.status_code == 200

    recurrence_id = uuid.UUID(task["recurrence_id"])
    result = await db.execute(select(Task).where(Task.recurrence_id == recurrence_id))
    tasks = list(result.scalars().all())
    assert len(tasks) == 1
    assert tasks[0].status == "done"


async def test_task_recurrence_is_audited_without_search_or_graph_outbox(client, db):
    await login(client, db)

    created = await client.post(
        "/tasks",
        json={
            "title": "Audit-only repeat",
            "recurrence": {"frequency": "daily", "start_date": "2026-07-09"},
        },
    )
    assert created.status_code == 201
    recurrence_id = uuid.UUID(created.json()["recurrence_id"])

    audits = list(
        (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "task_recurrence",
                    AuditLog.entity_id == recurrence_id,
                )
            )
        ).scalars()
    )
    assert [audit.action for audit in audits] == ["create"]

    outbox = list(
        (
            await db.execute(
                select(OutboxEvent).where(
                    OutboxEvent.aggregate_type == "task_recurrence",
                    OutboxEvent.aggregate_id == recurrence_id,
                )
            )
        ).scalars()
    )
    assert outbox == []
