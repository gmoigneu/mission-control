from datetime import date, timedelta

from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.inbox_item import InboxItem
from app.models.planning_message import PlanningMessage
from app.models.task import Task
from app.schemas.planning_message import PlanningMessageCreate
from app.services import planning_message as planning_svc
from app.telegram import client as telegram_client
from tests.helpers import login


async def test_planning_messages_require_auth(client):
    assert (await client.get("/planning/messages")).status_code == 401


async def test_create_list_and_status_transition(client, db):
    await login(client, db, email="planning-create@example.com")

    created = await client.post(
        "/planning/messages",
        json={
            "kind": "evening_plan",
            "title": "Tomorrow",
            "summary": "Review the plan.",
            "target_date": "2026-06-23",
            "body": {"recommendations": []},
        },
    )
    assert created.status_code == 201
    message = created.json()
    assert message["status"] == "draft"
    assert message["app_link"] == f"/planning?message={message['id']}"

    listing = await client.get("/planning/messages")
    assert listing.status_code == 200
    assert [row["id"] for row in listing.json()] == [message["id"]]

    reviewed = await client.patch(
        f"/planning/messages/{message['id']}", json={"status": "reviewed"}
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["reviewed_at"] is not None

    conflict = await client.patch(
        f"/planning/messages/{message['id']}", json={"status": "draft"}
    )
    assert conflict.status_code == 409


async def test_generate_prioritizes_due_work_and_apply_writes_task_audit(client, db):
    await login(client, db, email="planning-generate@example.com")
    target = date.today()
    overdue = await client.post(
        "/tasks",
        json={"title": "Pay overdue invoice", "due": (target - timedelta(days=1)).isoformat()},
    )
    due_today = await client.post(
        "/tasks", json={"title": "Send launch note", "due": target.isoformat()}
    )
    later = await client.post(
        "/tasks",
        json={"title": "Someday cleanup", "due": (target + timedelta(days=20)).isoformat()},
    )
    assert overdue.status_code == due_today.status_code == later.status_code == 201

    generated = await client.post(
        "/planning/messages/generate",
        json={"kind": "morning_triage", "target_date": target.isoformat()},
    )
    assert generated.status_code == 201
    message = generated.json()
    recs = message["body"]["recommendations"]
    assert recs[0]["title"] == "Pay overdue invoice"
    assert recs[0]["bucket"] == "overdue"
    assert recs[1]["title"] == "Send launch note"
    assert "in_app" in message["sent_channels"]

    applied = await client.post(
        f"/planning/messages/{message['id']}/apply",
        json={
            "items": [
                {
                    "recommendation_id": recs[0]["id"],
                    "action": "mark_done",
                }
            ]
        },
    )
    assert applied.status_code == 200
    assert applied.json()["message"]["status"] == "reviewed"

    task = await db.get(Task, overdue.json()["id"])
    assert task.status == "done"
    audits = list(
        (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.entity_type == "task",
                    AuditLog.entity_id == task.id,
                    AuditLog.surface == "planning",
                )
            )
        )
        .scalars()
        .all()
    )
    assert audits


async def test_generate_can_deliver_short_telegram_summary(client, db, monkeypatch):
    await login(client, db, email="planning-telegram@example.com")
    await client.post("/tasks", json={"title": "Check production", "due": date.today().isoformat()})
    monkeypatch.setattr(telegram_client, "is_configured", lambda: True)
    from app.config import settings

    monkeypatch.setattr(settings, "telegram_allowed_chat_ids", "123")
    sent: list[tuple[int, str]] = []

    async def fake_send(chat_id: int, text: str) -> None:
        sent.append((chat_id, text))

    monkeypatch.setattr(telegram_client, "send_message", fake_send)

    generated = await client.post(
        "/planning/messages/generate",
        json={"kind": "evening_plan", "deliver_telegram": True},
    )

    assert generated.status_code == 201
    assert generated.json()["sent_channels"] == ["in_app", "telegram"]
    assert generated.json()["body"]["telegram_delivery"] == {
        "sent_chat_ids": [123],
        "failed_chat_ids": [],
    }
    assert sent
    assert sent[0][0] == 123
    assert "Review in Mission Control" in sent[0][1]


async def test_apply_ignores_task_fields_outside_action_allowlist(client, db):
    await login(client, db, email="planning-allowlist@example.com")
    target = date.today()
    task_resp = await client.post(
        "/tasks",
        json={"title": "Protect this task", "due": target.isoformat()},
    )
    assert task_resp.status_code == 201

    generated = await client.post(
        "/planning/messages/generate",
        json={"kind": "morning_triage", "target_date": target.isoformat()},
    )
    message = generated.json()
    rec = message["body"]["recommendations"][0]

    applied = await client.post(
        f"/planning/messages/{message['id']}/apply",
        json={
            "items": [
                {
                    "recommendation_id": rec["id"],
                    "action": "keep_today",
                    "changes": {
                        "status": "archived",
                        "completed_at": "1970-01-01T00:00:00Z",
                    },
                }
            ]
        },
    )

    assert applied.status_code == 200, applied.text
    task = await db.get(Task, task_resp.json()["id"])
    assert task.status == "open"
    assert task.completed_at is None
    assert task.scheduled == target


async def test_apply_rejects_empty_items_and_dismissed_messages(client, db):
    await login(client, db, email="planning-apply-guards@example.com")
    created = await client.post(
        "/planning/messages",
        json={
            "kind": "morning_triage",
            "title": "Guarded",
            "summary": "Nothing to apply.",
            "target_date": date.today().isoformat(),
            "body": {"recommendations": []},
        },
    )
    message = created.json()

    empty = await client.post(
        f"/planning/messages/{message['id']}/apply",
        json={"items": []},
    )
    assert empty.status_code == 400

    dismissed = await client.patch(
        f"/planning/messages/{message['id']}", json={"status": "dismissed"}
    )
    assert dismissed.status_code == 200

    blocked = await client.post(
        f"/planning/messages/{message['id']}/apply",
        json={"items": [{"recommendation_id": "missing"}]},
    )
    assert blocked.status_code == 409


async def test_empty_inbox_items_generate_and_apply_safely(client, db):
    await login(client, db, email="planning-empty-inbox@example.com")
    inbox_resp = await client.post("/inbox", json={"body": "   "})
    assert inbox_resp.status_code == 201

    generated = await client.post(
        "/planning/messages/generate",
        json={"kind": "morning_triage", "target_date": date.today().isoformat()},
    )
    assert generated.status_code == 201, generated.text
    message = generated.json()
    inbox_rec = next(
        rec for rec in message["body"]["recommendations"] if rec["type"] == "inbox_item"
    )
    assert inbox_rec["title"] == "Inbox item"

    applied = await client.post(
        f"/planning/messages/{message['id']}/apply",
        json={"items": [{"recommendation_id": inbox_rec["id"]}]},
    )
    assert applied.status_code == 200, applied.text
    tasks = list((await db.execute(select(Task).where(Task.title == "Inbox item"))).scalars())
    assert tasks
    inbox = await db.get(InboxItem, inbox_resp.json()["id"])
    assert inbox.status == "processed"


async def test_telegram_partial_failure_still_saves_generated_message(client, db, monkeypatch):
    await login(client, db, email="planning-telegram-partial@example.com")
    await client.post("/tasks", json={"title": "Check production", "due": date.today().isoformat()})
    monkeypatch.setattr(telegram_client, "is_configured", lambda: True)
    from app.config import settings

    monkeypatch.setattr(settings, "telegram_allowed_chat_ids", "123,456")
    sent: list[int] = []

    async def fake_send(chat_id: int, text: str) -> None:  # noqa: ARG001
        if chat_id == 456:
            raise telegram_client.TelegramError("temporary outage")
        sent.append(chat_id)

    monkeypatch.setattr(telegram_client, "send_message", fake_send)

    generated = await client.post(
        "/planning/messages/generate",
        json={"kind": "evening_plan", "deliver_telegram": True},
    )

    assert generated.status_code == 201, generated.text
    assert sent == [123]
    assert generated.json()["sent_channels"] == ["in_app", "telegram"]
    assert generated.json()["body"]["telegram_delivery"] == {
        "sent_chat_ids": [123],
        "failed_chat_ids": [456],
    }


async def test_partial_apply_keeps_remaining_recommendations_reviewable(client, db):
    await login(client, db, email="planning-partial@example.com")
    today = date.today()
    first = await client.post("/tasks", json={"title": "First task", "due": today.isoformat()})
    second = await client.post("/tasks", json={"title": "Second task", "due": today.isoformat()})
    assert first.status_code == second.status_code == 201
    message = await planning_svc.create_message(
        db,
        PlanningMessageCreate(
            kind="morning_triage",
            status="sent",
            title="Plan",
            summary="Two recommendations.",
            target_date=today,
            body={
                "recommendations": [
                    {
                        "id": "first-rec",
                        "type": "task",
                        "task_id": first.json()["id"],
                        "title": "First task",
                        "suggested_action": "keep_today",
                        "proposed_changes": {},
                    },
                    {
                        "id": "second-rec",
                        "type": "task",
                        "task_id": second.json()["id"],
                        "title": "Second task",
                        "suggested_action": "keep_today",
                        "proposed_changes": {},
                    },
                ]
            },
            sent_channels=["in_app"],
        ),
    )
    await db.commit()

    first_apply = await client.post(
        f"/planning/messages/{message.id}/apply",
        json={"items": [{"recommendation_id": "first-rec", "action": "keep_today"}]},
    )
    assert first_apply.status_code == 200, first_apply.text
    assert first_apply.json()["message"]["status"] == "reviewed"

    second_apply = await client.post(
        f"/planning/messages/{message.id}/apply",
        json={"items": [{"recommendation_id": "second-rec", "action": "keep_today"}]},
    )
    assert second_apply.status_code == 200, second_apply.text
    assert second_apply.json()["message"]["status"] == "applied"


async def test_defer_without_date_moves_task_to_future(client, db):
    await login(client, db, email="planning-defer@example.com")
    task_resp = await client.post("/tasks", json={"title": "Wait on vendor"})
    task_id = task_resp.json()["id"]
    message = await planning_svc.create_message(
        db,
        PlanningMessageCreate(
            kind="morning_triage",
            status="sent",
            title="Plan",
            summary="Defer safely.",
            target_date=date.today(),
            body={
                "recommendations": [
                    {
                        "id": "defer-1",
                        "type": "task",
                        "task_id": task_id,
                        "title": "Wait on vendor",
                        "suggested_action": "defer",
                        "proposed_changes": {},
                    }
                ]
            },
            sent_channels=["in_app"],
        ),
    )
    await db.commit()

    applied = await client.post(
        f"/planning/messages/{message.id}/apply",
        json={"items": [{"recommendation_id": "defer-1", "action": "defer"}]},
    )

    assert applied.status_code == 200, applied.text
    task = await db.get(Task, task_id)
    assert task.scheduled == date.today() + timedelta(days=7)


async def test_telegram_summary_sanitizes_app_link():
    message = PlanningMessage(
        kind="evening_plan",
        status="sent",
        title="Tomorrow",
        summary="Review.",
        target_date=date.today(),
        app_link="/planning\nInjected: nope",
        sent_channels=["in_app"],
    )
    text = planning_svc.telegram_summary(message)

    assert "Injected" not in text
    assert "Review in Mission Control" in text
