import re
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.inbox_item import InboxItem
from app.models.planning_message import PlanningMessage
from app.models.task import Task
from app.schemas.inbox_item import InboxItemUpdate
from app.schemas.planning_message import (
    PlanningApplyItem,
    PlanningMessageCreate,
    PlanningMessageGenerate,
    PlanningMessageUpdate,
)
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import inbox_item as inbox_svc
from app.services import task as task_svc
from app.telegram import client as telegram_client

ENTITY = "planning_message"
OPEN_TASK_STATUSES = {"open", "in_progress"}
TASK_LINK = "/tasks?edit={task_id}"
STATUS_TRANSITIONS = {
    "draft": {"sent", "reviewed", "dismissed", "applied"},
    "sent": {"reviewed", "dismissed", "applied"},
    "reviewed": {"sent", "dismissed", "applied"},
    "dismissed": {"reviewed"},
    "applied": set(),
}
TASK_CHANGE_KEYS_BY_ACTION = {
    "keep_today": {"scheduled"},
    "move_tomorrow": {"scheduled"},
    "defer": {"scheduled"},
    "mark_done": set(),
    "archive": set(),
    "clarify": {"title", "body", "outcome"},
    "none": set(),
}
INBOX_CHANGE_KEYS_BY_ACTION = {
    "convert_inbox_to_task": {"title"},
}


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid_list(values: list[uuid.UUID] | list[str]) -> list[str]:
    return [str(value) for value in values]


def _coerce_uuid_list(values: list[str] | None) -> list[uuid.UUID]:
    return [uuid.UUID(value) for value in values or []]


def _first_line(value: str | None, *, fallback: str) -> str:
    lines = (value or "").strip().splitlines()
    return (lines[0][:80] if lines else "") or fallback


def _filtered_changes(changes: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
    return {key: value for key, value in changes.items() if key in allowed}


async def list_messages(
    db: AsyncSession, *, limit: int = 20, target_date: date | None = None
) -> list[PlanningMessage]:
    stmt = select(PlanningMessage).order_by(PlanningMessage.created_at.desc()).limit(limit)
    if target_date is not None:
        stmt = stmt.where(PlanningMessage.target_date == target_date)
    return list((await db.execute(stmt)).scalars().all())


async def get_message(db: AsyncSession, message_id: uuid.UUID) -> PlanningMessage | None:
    return await db.get(PlanningMessage, message_id)


async def create_message(
    db: AsyncSession, data: PlanningMessageCreate, *, surface: str = "api"
) -> PlanningMessage:
    del surface
    obj = PlanningMessage(
        kind=data.kind,
        status=data.status,
        title=data.title,
        summary=data.summary,
        body=data.body,
        related_task_ids=_uuid_list(data.related_task_ids),
        related_inbox_item_ids=_uuid_list(data.related_inbox_item_ids),
        target_date=data.target_date,
        app_link=data.app_link or "/planning",
        sent_channels=data.sent_channels,
        agent_run_id=data.agent_run_id,
        sent_at=_utcnow() if data.status == "sent" else None,
    )
    db.add(obj)
    await db.flush()
    if data.app_link is None:
        obj.app_link = f"/planning?message={obj.id}"
    return obj


async def update_message(
    db: AsyncSession, obj: PlanningMessage, data: PlanningMessageUpdate
) -> PlanningMessage:
    patch = data.model_dump(exclude_unset=True)
    next_status = patch.get("status")
    if next_status and next_status != obj.status:
        allowed = STATUS_TRANSITIONS.get(obj.status, set())
        if next_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot move planning message from {obj.status} to {next_status}",
            )
        if next_status == "reviewed":
            obj.reviewed_at = _utcnow()
    for key, value in patch.items():
        setattr(obj, key, value)
    await db.flush()
    return obj


async def _open_tasks(db: AsyncSession) -> list[Task]:
    stmt = select(Task).where(Task.status.in_(OPEN_TASK_STATUSES)).order_by(Task.created_at)
    return list((await db.execute(stmt)).scalars().all())


async def _open_inbox_items(db: AsyncSession) -> list[InboxItem]:
    stmt = select(InboxItem).where(InboxItem.status == "open").order_by(InboxItem.created_at)
    return list((await db.execute(stmt)).scalars().all())


def _rank_task(task: Task, target: date) -> tuple[int, str, str]:
    if task.due and task.due < target:
        return (0, "overdue", "Due before the plan date")
    if task.due == target:
        return (1, "due_today", "Due on the plan date")
    if task.due and task.due <= target + timedelta(days=7):
        return (2, "due_soon", "Due in the next seven days")
    if not task.outcome and not task.body:
        return (3, "unclear", "Missing outcome or body")
    stale_cutoff = _utcnow() - timedelta(days=14)
    if not task.due and not task.scheduled and task.updated_at and task.updated_at < stale_cutoff:
        return (4, "stale", "Undated and untouched for over two weeks")
    return (5, "nice_to_have", "Open but not urgent")


def _task_recommendation(task: Task, target: date, rank: int) -> dict[str, Any]:
    score, bucket, reason = _rank_task(task, target)
    action = "keep_today" if score <= 2 else "clarify" if bucket == "unclear" else "defer"
    changes: dict[str, Any] = {}
    if action == "keep_today":
        changes["scheduled"] = target.isoformat()
    elif action == "defer":
        changes["scheduled"] = (target + timedelta(days=7)).isoformat()
    return {
        "id": f"task-{task.id}",
        "type": "task",
        "task_id": str(task.id),
        "title": task.title,
        "bucket": bucket,
        "rank": rank,
        "suggested_action": action,
        "reason": reason,
        "proposed_changes": changes,
        "status": "pending",
        "due": task.due.isoformat() if task.due else None,
        "scheduled": task.scheduled.isoformat() if task.scheduled else None,
    }


def _inbox_recommendation(item: InboxItem, rank: int) -> dict[str, Any]:
    title = _first_line(item.body, fallback="Inbox item")
    return {
        "id": f"inbox-{item.id}",
        "type": "inbox_item",
        "inbox_item_id": str(item.id),
        "title": title,
        "bucket": "inbox",
        "rank": rank,
        "suggested_action": "convert_inbox_to_task",
        "reason": "Inbox item needs explicit triage",
        "proposed_changes": {"title": title},
        "status": "pending",
    }


def _target_for_kind(kind: str, requested: date | None) -> date:
    today = date.today()
    if requested is not None:
        return requested
    if kind == "evening_plan":
        return today + timedelta(days=1)
    return today


def _title_for_kind(kind: str, target: date) -> str:
    labels = {
        "evening_plan": "Tomorrow plan",
        "morning_triage": "Morning triage",
        "midday_replan": "Midday replan",
        "follow_through_nudge": "Follow-through nudge",
    }
    return f"{labels[kind]} · {target.isoformat()}"


def _summary(kind: str, committed: list[dict[str, Any]], urgent_count: int) -> str:
    if kind == "follow_through_nudge":
        if committed:
            return f"Protect the next commitment: {committed[0]['title']}."
        return "No urgent open commitment needs a nudge right now."
    noun = "tomorrow" if kind == "evening_plan" else "today"
    return (
        f"Aya found {urgent_count} overdue/due-soon item(s) and proposes "
        f"{len(committed)} committed task(s) for {noun}."
    )


async def generate_message(
    db: AsyncSession, request: PlanningMessageGenerate
) -> PlanningMessage:
    target = _target_for_kind(request.kind, request.target_date)
    tasks = await _open_tasks(db)
    inbox_items = await _open_inbox_items(db)
    ranked = sorted(tasks, key=lambda task: (*_rank_task(task, target)[:1], task.created_at))

    task_recs = [_task_recommendation(task, target, index + 1) for index, task in enumerate(ranked)]
    committed = [rec for rec in task_recs if rec["bucket"] in {"overdue", "due_today", "due_soon"}]
    if len(committed) < 3:
        committed = task_recs[: min(7, max(3, len(task_recs)))]
    else:
        committed = committed[:7]

    inbox_recs = [
        _inbox_recommendation(item, len(task_recs) + index + 1)
        for index, item in enumerate(inbox_items[:5])
    ]
    recommendations = task_recs + inbox_recs
    urgent_count = len(
        [rec for rec in task_recs if rec["bucket"] in {"overdue", "due_today", "due_soon"}]
    )
    body = {
        "recommendations": recommendations,
        "sections": {
            "committed_task_ids": [rec["task_id"] for rec in committed if rec["type"] == "task"],
            "overdue_task_ids": [
                rec["task_id"] for rec in task_recs if rec["bucket"] == "overdue"
            ],
            "due_today_task_ids": [
                rec["task_id"] for rec in task_recs if rec["bucket"] == "due_today"
            ],
            "due_soon_task_ids": [
                rec["task_id"] for rec in task_recs if rec["bucket"] == "due_soon"
            ],
            "stale_or_unclear_task_ids": [
                rec["task_id"]
                for rec in task_recs
                if rec["bucket"] in {"stale", "unclear"}
            ],
            "inbox_item_ids": [str(item.id) for item in inbox_items[:5]],
        },
    }
    message = await create_message(
        db,
        PlanningMessageCreate(
            kind=request.kind,
            status="sent",
            title=_title_for_kind(request.kind, target),
            summary=_summary(request.kind, committed, urgent_count),
            body=body,
            related_task_ids=_coerce_uuid_list([rec["task_id"] for rec in task_recs]),
            related_inbox_item_ids=[item.id for item in inbox_items[:5]],
            target_date=target,
            sent_channels=["in_app"],
        ),
        surface="generator",
    )
    return message


def _safe_app_link(app_link: str | None) -> str:
    cleaned = (app_link or "/planning").splitlines()[0].strip()
    if not cleaned.startswith("/") or cleaned.startswith("//"):
        return "/planning"
    return cleaned


def _absolute_app_link(app_link: str) -> str:
    return f"{settings.webauthn_rp_origin.rstrip('/')}{_safe_app_link(app_link)}"


def telegram_summary(message: PlanningMessage) -> str:
    link = _absolute_app_link(message.app_link)
    return f"**{message.title}**\n\n{message.summary}\n\nReview in Mission Control: {link}"


async def deliver_to_telegram(db: AsyncSession, message: PlanningMessage) -> PlanningMessage:
    if not telegram_client.is_configured():
        return message
    chat_ids = settings.telegram_allowed_chat_id_set
    if not chat_ids:
        return message
    sent_chat_ids: list[int] = []
    failed_chat_ids: list[int] = []
    for chat_id in chat_ids:
        try:
            await telegram_client.send_message(chat_id, telegram_summary(message))
        except (telegram_client.TelegramError, httpx.HTTPError):
            failed_chat_ids.append(chat_id)
            continue
        sent_chat_ids.append(chat_id)
        channels = set(message.sent_channels or [])
        channels.add("telegram")
        message.sent_channels = sorted(channels)
        message.sent_at = _utcnow()
        if message.status == "draft":
            message.status = "sent"
    message.body = {
        **(message.body or {}),
        "telegram_delivery": {
            "sent_chat_ids": sent_chat_ids,
            "failed_chat_ids": failed_chat_ids,
        },
    }
    await db.flush()
    return message


_COMMAND_PATTERNS = [
    (
        "mark_done",
        re.compile(r"^mark\s+(.+?)\s+done$", re.IGNORECASE),
    ),
    (
        "move_tomorrow",
        re.compile(r"^move\s+(.+?)\s+to\s+tomorrow$", re.IGNORECASE),
    ),
    (
        "archive",
        re.compile(r"^(?:drop|archive)\s+(.+)$", re.IGNORECASE),
    ),
    (
        "rename",
        re.compile(r"^rename\s+(.+?)\s+to\s+(.+)$", re.IGNORECASE),
    ),
]


def _strip_ref(value: str) -> str:
    return value.strip().strip("\"'")


async def _resolve_task_reference(db: AsyncSession, reference: str) -> Task | str | None:
    matches = await task_svc.search_tasks(db, _strip_ref(reference), limit=5)
    if not matches:
        return None
    ref = _strip_ref(reference).lower()
    exact = [task for task in matches if task.title.lower() == ref]
    if len(exact) == 1:
        return exact[0]
    if len(matches) == 1:
        return matches[0]
    titles = ", ".join(task.title for task in matches[:3])
    return f"I found multiple matching tasks: {titles}. Please use the exact title."


async def handle_telegram_task_command(db: AsyncSession, text: str) -> str | None:
    """Apply explicit single-task Telegram commands.

    Returns None when the message is not a planning/task command, so the regular
    Aya Telegram chat path can handle it. Passive planning summaries never call
    this function, so they cannot mutate state.
    """
    stripped = text.strip()
    for action, pattern in _COMMAND_PATTERNS:
        match = pattern.match(stripped)
        if not match:
            continue
        reference = match.group(1)
        resolved = await _resolve_task_reference(db, reference)
        if resolved is None:
            return f"I couldn't find a task matching “{_strip_ref(reference)}”."
        if isinstance(resolved, str):
            return resolved
        task = resolved
        if action == "mark_done":
            await task_svc.update_task(
                db,
                task,
                TaskUpdate(status="done", completed_at=_utcnow()),
                surface="telegram",
            )
            changed = "marked done"
        elif action == "move_tomorrow":
            tomorrow = date.today() + timedelta(days=1)
            await task_svc.update_task(
                db, task, TaskUpdate(scheduled=tomorrow), surface="telegram"
            )
            changed = f"moved to {tomorrow.isoformat()}"
        elif action == "archive":
            await task_svc.update_task(
                db, task, TaskUpdate(status="archived"), surface="telegram"
            )
            changed = "archived"
        elif action == "rename":
            new_title = _strip_ref(match.group(2))
            if not new_title:
                return "Tell me the new title after “to”."
            old_title = task.title
            await task_svc.update_task(
                db, task, TaskUpdate(title=new_title), surface="telegram"
            )
            link = _absolute_app_link(TASK_LINK.format(task_id=task.id))
            return (
                f"Task “{old_title}” renamed to “{new_title}”. "
                f"Review or undo in Mission Control: {link}"
            )
        else:  # pragma: no cover - guarded by patterns above
            return None
        link = _absolute_app_link(TASK_LINK.format(task_id=task.id))
        return f"Task “{task.title}” {changed}. Review or undo in Mission Control: {link}"
    if re.match(r"^split\s+.+", stripped, re.IGNORECASE):
        return (
            "Splitting needs review in the planning UI for v1. "
            "Open Mission Control to split safely."
        )
    return None


def _recommendation_by_id(message: PlanningMessage) -> dict[str, dict[str, Any]]:
    recs = (message.body or {}).get("recommendations", [])
    return {str(rec.get("id")): rec for rec in recs if rec.get("id")}


async def _apply_task_action(
    db: AsyncSession, rec: dict[str, Any], item: PlanningApplyItem
) -> bool:
    task_id = uuid.UUID(rec["task_id"])
    task = await task_svc.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    action = item.action or rec.get("suggested_action") or "none"
    allowed = TASK_CHANGE_KEYS_BY_ACTION.get(action, set())
    changes = _filtered_changes(dict(rec.get("proposed_changes") or {}), allowed)
    changes.update(_filtered_changes(item.changes or {}, allowed))
    if action == "keep_today":
        changes.setdefault("scheduled", date.today().isoformat())
    elif action == "move_tomorrow":
        changes["scheduled"] = (date.today() + timedelta(days=1)).isoformat()
    elif action == "defer":
        changes.setdefault("scheduled", (date.today() + timedelta(days=7)).isoformat())
    elif action == "mark_done":
        changes["status"] = "done"
        changes["completed_at"] = _utcnow().isoformat()
    elif action == "archive":
        changes["status"] = "archived"
    elif action in {"clarify", "none"} and not changes:
        return False
    if not changes:
        return False
    await task_svc.update_task(db, task, TaskUpdate(**changes), surface="planning")
    return True


async def _apply_inbox_action(
    db: AsyncSession, rec: dict[str, Any], item: PlanningApplyItem
) -> bool:
    inbox_id = uuid.UUID(rec["inbox_item_id"])
    inbox = await inbox_svc.get_inbox_item(db, inbox_id)
    if inbox is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inbox item not found")
    action = item.action or rec.get("suggested_action") or "none"
    if action != "convert_inbox_to_task":
        return False
    allowed = INBOX_CHANGE_KEYS_BY_ACTION.get(action, set())
    changes = _filtered_changes(dict(rec.get("proposed_changes") or {}), allowed)
    changes.update(_filtered_changes(item.changes or {}, allowed))
    title = str(changes.get("title") or _first_line(inbox.body, fallback="Inbox item"))
    await task_svc.create_task(
        db,
        TaskCreate(title=title, body=inbox.body, source=f"inbox:{inbox.id}"),
        surface="planning",
    )
    await inbox_svc.update_inbox_item(
        db, inbox, InboxItemUpdate(status="processed"), surface="planning"
    )
    return True


async def apply_recommendations(
    db: AsyncSession, message: PlanningMessage, items: list[PlanningApplyItem]
) -> tuple[PlanningMessage, list[str]]:
    if not items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="items must be non-empty"
        )
    if "applied" not in STATUS_TRANSITIONS.get(message.status, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot move planning message from {message.status} to applied",
        )
    recs = _recommendation_by_id(message)
    applied: list[str] = []
    for item in items:
        rec = recs.get(item.recommendation_id)
        if rec is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Suggestion not found"
            )
        did_apply = False
        if rec.get("type") == "task":
            did_apply = await _apply_task_action(db, rec, item)
        elif rec.get("type") == "inbox_item":
            did_apply = await _apply_inbox_action(db, rec, item)
        if did_apply:
            rec["status"] = "applied"
            applied.append(item.recommendation_id)
    message.body = {**(message.body or {}), "recommendations": list(recs.values())}
    message.status = (
        "applied"
        if recs and all(rec.get("status") == "applied" for rec in recs.values())
        else "reviewed"
    )
    message.reviewed_at = _utcnow()
    await db.flush()
    return message, applied
