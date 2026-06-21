from __future__ import annotations

import re
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.context import agent_run_id_var, surface_var
from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_update
from app.models.agent_run import AgentRun
from app.models.audit import AuditLog
from app.models.capture import Capture
from app.schemas.capture import (
    CaptureApplyRequest,
    CaptureCandidate,
    CaptureInboxRequest,
    CaptureRequest,
    CaptureResult,
    InboxPromotionRequest,
)
from app.schemas.context import ContextCreate
from app.schemas.inbox_item import InboxItemCreate, InboxItemUpdate
from app.schemas.journal_entry import JournalEntryUpdate
from app.schemas.knowledge import KnowledgeCreate
from app.schemas.observation import ObservationCreate
from app.schemas.task import TaskCreate
from app.services import context as context_svc
from app.services import inbox_item as inbox_svc
from app.services import journal_entry as journal_svc
from app.services import knowledge as knowledge_svc
from app.services import observation as observation_svc
from app.services import task as task_svc

HIGH_CONFIDENCE = 0.82
ENTITY = "capture"


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:80] or f"capture-{uuid.uuid4().hex[:8]}"


async def _writes_for_run(db: AsyncSession, run_id: uuid.UUID) -> list[dict[str, Any]]:
    stmt = select(AuditLog).where(AuditLog.agent_run_id == run_id).order_by(AuditLog.created_at)
    rows = list((await db.execute(stmt)).scalars().all())
    return [
        {
            "id": str(a.id),
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": str(a.entity_id),
        }
        for a in rows
    ]


@asynccontextmanager
async def _capture_run(db: AsyncSession, surface: str, raw_text: str):
    run = AgentRun(surface=surface, input=raw_text, status="ok")
    db.add(run)
    await db.flush()
    run_token = agent_run_id_var.set(run.id)
    surface_token = surface_var.set(surface)
    try:
        yield run
        await db.flush()
    except Exception as exc:
        run.status = "error"
        run.error = str(exc)
        await db.flush()
        raise
    finally:
        agent_run_id_var.reset(run_token)
        surface_var.reset(surface_token)


def interpret_capture(text: str) -> CaptureResult:
    raw = text.strip()
    lower = raw.lower()

    task_match = re.match(
        r"^(?:create\s+(?:a\s+)?)?(?:task|todo|to-do|reminder)\s+(?:to\s+)?(?P<title>.+)$",
        lower,
    )
    follow_up = re.match(r"^follow up (?:with )?(?P<title>.+)$", lower)
    if task_match or follow_up or lower.startswith("remind me to "):
        title = raw
        for prefix in (
            "create a task to ",
            "create task to ",
            "create a task ",
            "create task ",
            "task to ",
            "task ",
            "todo ",
            "to-do ",
            "reminder to ",
            "reminder ",
            "remind me to ",
        ):
            if lower.startswith(prefix):
                title = raw[len(prefix) :]
                break
        if follow_up:
            title = raw
        candidate = CaptureCandidate(
            id="task-1",
            intent="create_task",
            entity_type="task",
            confidence=0.92,
            fields={"title": title.strip(), "status": "open", "priority": "normal", "body": raw},
            required_fields=["title"],
        )
        return CaptureResult(
            intent="create_task",
            confidence=0.92,
            suggested_next_action="Create a task",
            proposed_actions=[candidate],
        )

    context_match = re.match(r"^create (?:a )?context (?P<name>.+)$", lower)
    if context_match:
        name = raw[raw.lower().find("context") + len("context") :].strip()
        candidate = CaptureCandidate(
            id="context-1",
            intent="unknown",
            entity_type="context",
            confidence=0.9,
            fields={"name": name, "slug": _slugify(name), "category": "other"},
            required_fields=["name", "slug"],
        )
        return CaptureResult(
            intent="unknown",
            confidence=0.9,
            suggested_next_action="Create a context",
            proposed_actions=[candidate],
        )

    url_match = re.search(r"https?://\S+", raw)
    if url_match:
        candidate = CaptureCandidate(
            id="knowledge-1",
            intent="create_knowledge_source",
            entity_type="knowledge",
            confidence=0.78,
            fields={
                "title": raw.replace(url_match.group(0), "").strip(" :-") or url_match.group(0),
                "slug": _slugify(raw),
                "body": raw,
            },
            required_fields=["title", "slug"],
            warnings=["Review whether this should become a source, note, or task."],
        )
        return CaptureResult(
            intent="create_knowledge_source",
            confidence=0.78,
            ambiguity_notes=["A link could be reference material or a follow-up task."],
            suggested_next_action="Preview as knowledge",
            proposed_actions=[candidate],
        )

    observation_match = re.match(
        r"^(?P<name>[A-Z][A-Za-z .'-]{1,60})\s+(?:said|prefers|likes|wants)\s+.+", raw
    )
    if observation_match:
        candidate = CaptureCandidate(
            id="observation-1",
            intent="create_observation",
            entity_type="observation",
            confidence=0.64,
            fields={"body": raw, "kind": "observation", "subject_type": "person"},
            required_fields=["subject_type", "subject_id", "body"],
            missing_fields=["subject_id"],
            warnings=["Choose the person before saving this observation."],
            selected=False,
        )
        return CaptureResult(
            intent="create_observation",
            confidence=0.64,
            ambiguity_notes=[
                "The note looks like an observation but the target person is unresolved."
            ],
            suggested_next_action="Send to inbox for review",
            proposed_actions=[candidate],
        )

    return CaptureResult(
        intent="unknown",
        confidence=0.35,
        ambiguity_notes=["No safe structured action matched this capture."],
        suggested_next_action="Send to inbox",
        proposed_actions=[],
    )


async def create_capture(
    db: AsyncSession, payload: CaptureRequest
) -> tuple[Capture, CaptureResult, list[dict[str, Any]], uuid.UUID]:
    result = interpret_capture(payload.text)
    surface = payload.source_surface
    async with _capture_run(db, surface, payload.text) as run:
        capture = Capture(
            raw_text=payload.text,
            transcript=payload.transcript,
            source_surface=surface,
            source_metadata=payload.source_metadata,
            status="interpreted",
            confidence_summary={"confidence": result.confidence, "intent": result.intent},
            structured_result=result.model_dump(mode="json"),
            agent_run_id=run.id,
        )
        db.add(capture)
        await db.flush()
        await record_create(db, ENTITY, capture, surface=surface)

        if (
            payload.auto_apply
            and result.confidence >= HIGH_CONFIDENCE
            and len(result.proposed_actions) == 1
        ):
            await _apply_actions(db, capture, result.proposed_actions, surface=surface)
            reply = "Captured and applied."
        elif (
            result.confidence < HIGH_CONFIDENCE
            and result.suggested_next_action.lower().startswith("send")
        ):
            await _send_capture_to_inbox(
                db,
                capture,
                CaptureInboxRequest(
                    reason="Low confidence capture",
                    suggested_action=result.suggested_next_action,
                ),
                surface=surface,
            )
            reply = "Captured to inbox for review."
        else:
            before = model_to_dict(capture)
            capture.status = "previewed"
            await db.flush()
            await record_update(db, ENTITY, capture, before, surface=surface)
            reply = "Capture preview ready."

        run.reply = reply
        run.transcript = [
            {"role": "user", "content": payload.text},
            {"role": "assistant", "content": reply},
        ]
        run.tool_calls = []
        writes = await _writes_for_run(db, run.id)
        return capture, result, writes, run.id


async def get_capture(db: AsyncSession, capture_id: uuid.UUID) -> Capture | None:
    return await db.get(Capture, capture_id)


async def apply_capture(
    db: AsyncSession, capture: Capture, payload: CaptureApplyRequest
) -> tuple[Capture, list[dict[str, Any]], uuid.UUID]:
    result = CaptureResult.model_validate(capture.structured_result)
    actions = payload.actions or result.proposed_actions
    async with _capture_run(db, capture.source_surface, capture.raw_text) as run:
        await _apply_actions(db, capture, actions, surface=capture.source_surface)
        run.reply = "Capture applied."
        run.transcript = [
            {"role": "user", "content": capture.raw_text},
            {"role": "assistant", "content": run.reply},
        ]
        run.tool_calls = []
        writes = await _writes_for_run(db, run.id)
        return capture, writes, run.id


async def send_capture_to_inbox(
    db: AsyncSession, capture: Capture, payload: CaptureInboxRequest
) -> tuple[Capture, list[dict[str, Any]], uuid.UUID]:
    async with _capture_run(db, capture.source_surface, capture.raw_text) as run:
        await _send_capture_to_inbox(db, capture, payload, surface=capture.source_surface)
        run.reply = "Capture sent to inbox."
        run.transcript = [
            {"role": "user", "content": capture.raw_text},
            {"role": "assistant", "content": run.reply},
        ]
        run.tool_calls = []
        writes = await _writes_for_run(db, run.id)
        return capture, writes, run.id


async def dismiss_capture(
    db: AsyncSession, capture: Capture
) -> tuple[Capture, list[dict[str, Any]], uuid.UUID]:
    async with _capture_run(db, capture.source_surface, capture.raw_text) as run:
        before = model_to_dict(capture)
        capture.status = "dismissed"
        await db.flush()
        await record_update(db, ENTITY, capture, before, surface=capture.source_surface)
        run.reply = "Capture dismissed."
        run.transcript = [
            {"role": "user", "content": capture.raw_text},
            {"role": "assistant", "content": run.reply},
        ]
        run.tool_calls = []
        writes = await _writes_for_run(db, run.id)
        return capture, writes, run.id


async def _send_capture_to_inbox(
    db: AsyncSession, capture: Capture, payload: CaptureInboxRequest, *, surface: str
) -> None:
    result = CaptureResult.model_validate(capture.structured_result)
    item = await inbox_svc.create_inbox_item(
        db,
        InboxItemCreate(
            body=capture.raw_text,
            source=capture.source_surface,
            capture_id=capture.id,
            triage_reason=payload.reason or "; ".join(result.ambiguity_notes) or "Needs review",
            suggested_action=payload.suggested_action or result.suggested_next_action,
            source_metadata=capture.source_metadata,
        ),
        surface=surface,
    )
    before = model_to_dict(capture)
    capture.status = "inboxed"
    capture.inbox_item_id = item.id
    await db.flush()
    await record_update(db, ENTITY, capture, before, surface=surface)


async def _apply_actions(
    db: AsyncSession, capture: Capture, actions: list[CaptureCandidate], *, surface: str
) -> None:
    refs = list(capture.created_entity_refs or [])
    for action in actions:
        if not action.selected:
            continue
        ref = await _apply_action(db, capture, action, surface=surface)
        if ref is not None:
            refs.append(ref)
    before = model_to_dict(capture)
    capture.status = "applied"
    capture.created_entity_refs = refs
    await db.flush()
    await record_update(db, ENTITY, capture, before, surface=surface)


async def _apply_action(
    db: AsyncSession, capture: Capture, action: CaptureCandidate, *, surface: str
) -> dict[str, str] | None:
    fields = action.fields
    source = f"capture:{capture.id}"
    if action.entity_type == "task":
        task = await task_svc.create_task(
            db,
            TaskCreate(
                title=str(fields["title"]),
                status=fields.get("status", "open"),
                priority=fields.get("priority", "normal"),
                body=fields.get("body") or capture.raw_text,
                source=source,
            ),
            surface=surface,
        )
        return {"entity_type": "task", "entity_id": str(task.id)}
    if action.entity_type == "context":
        ctx = await context_svc.create_context(
            db,
            ContextCreate(
                slug=str(fields["slug"]),
                name=str(fields["name"]),
                category=fields.get("category", "other"),
            ),
            surface=surface,
        )
        return {"entity_type": "context", "entity_id": str(ctx.id)}
    if action.entity_type == "knowledge":
        knowledge = await knowledge_svc.create_knowledge(
            db,
            KnowledgeCreate(
                slug=str(fields["slug"]),
                title=str(fields["title"]),
                body=fields.get("body") or capture.raw_text,
            ),
            surface=surface,
        )
        return {"entity_type": "knowledge", "entity_id": str(knowledge.id)}
    if action.entity_type == "observation":
        if not fields.get("subject_id"):
            return None
        obs = await observation_svc.create_observation(
            db,
            ObservationCreate(
                subject_type=fields.get("subject_type", "person"),
                subject_id=uuid.UUID(str(fields["subject_id"])),
                body=fields.get("body") or capture.raw_text,
                kind=fields.get("kind", "observation"),
                source=source,
            ),
            surface=surface,
        )
        return {"entity_type": "observation", "entity_id": str(obs.id)}
    return None


async def promote_inbox_item(
    db: AsyncSession, item_id: uuid.UUID, payload: InboxPromotionRequest
) -> tuple[list[dict[str, Any]], uuid.UUID]:
    item = await inbox_svc.get_inbox_item(db, item_id)
    if item is None:
        raise ValueError("inbox item not found")
    raw_text = payload.body or item.body
    async with _capture_run(db, "ui", item.body) as run:
        refs: list[dict[str, str]] = []
        source = f"inbox:{item.id}"
        if payload.target == "task":
            task = await task_svc.create_task(
                db,
                TaskCreate(title=payload.title or item.body, body=raw_text, source=source),
                surface="ui",
            )
            refs.append({"entity_type": "task", "entity_id": str(task.id)})
        elif payload.target == "observation":
            if payload.subject_type is None or payload.subject_id is None:
                raise ValueError("subject_type and subject_id are required")
            obs = await observation_svc.create_observation(
                db,
                ObservationCreate(
                    subject_type=payload.subject_type,
                    subject_id=payload.subject_id,
                    body=raw_text,
                    source=source,
                ),
                surface="ui",
            )
            refs.append({"entity_type": "observation", "entity_id": str(obs.id)})
        elif payload.target == "knowledge_note":
            title = payload.title or item.body[:80]
            note = await knowledge_svc.create_knowledge(
                db,
                KnowledgeCreate(slug=_slugify(title), title=title, body=raw_text),
                surface="ui",
            )
            refs.append({"entity_type": "knowledge", "entity_id": str(note.id)})
        elif payload.target == "journal_entry":
            entry = await journal_svc.get_or_create_journal_entry(
                db, datetime.now(UTC).date(), surface="ui"
            )
            await journal_svc.update_journal_entry(
                db,
                entry,
                JournalEntryUpdate(body=((entry.body or "") + "\n" + raw_text).strip()),
                surface="ui",
            )
            refs.append({"entity_type": "journal_entry", "entity_id": str(entry.id)})

        await inbox_svc.update_inbox_item(
            db, item, InboxItemUpdate(status="processed"), surface="ui"
        )
        if item.capture_id is not None:
            capture = await get_capture(db, item.capture_id)
            if capture is not None:
                before = model_to_dict(capture)
                capture.status = "applied"
                capture.created_entity_refs = list(capture.created_entity_refs or []) + refs
                await db.flush()
                await record_update(db, ENTITY, capture, before, surface="ui")

        run.reply = "Inbox item promoted."
        run.transcript = [
            {"role": "user", "content": item.body},
            {"role": "assistant", "content": run.reply},
        ]
        run.tool_calls = []
        writes = await _writes_for_run(db, run.id)
        return writes, run.id
