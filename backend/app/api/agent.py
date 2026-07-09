"""Agent API — /agent/chat, /agent/capture, /agent/runs/{run_id}/revert, /agent/persona."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.agent import run_agent
from app.agent.conversation_store import (
    build_history_messages,
    create_conversation,
    get_or_create_current,
    reconstruct_messages,
)
from app.agent.persona_store import (
    DEFAULT_PERSONA,
    get_persona,
    reset_persona,
    upsert_persona,
)
from app.audit.revert import revert_audit
from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_update
from app.db import get_db
from app.deps import get_current_user
from app.models.agent_persona import AgentPersona
from app.models.audit import AuditLog
from app.models.user import AppUser
from app.schemas.agent_persona import PersonaOut, PersonaUpdate
from app.schemas.capture import (
    CaptureAgentResponse,
    CaptureApplyRequest,
    CaptureApplyResponse,
    CaptureInboxRequest,
    CaptureOut,
    CaptureRequest,
)
from app.services import capture as capture_svc

MAX_CHAT_MESSAGE_CHARS = 20_000
CHAT_MESSAGE_TOO_LONG_DETAIL = (
    f"Chat messages can be up to {MAX_CHAT_MESSAGE_CHARS:,} characters. "
    "Shorten the message or split it into smaller parts."
)

router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[Depends(get_current_user)],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    conversation_id: uuid.UUID | None = None


class AgentResponse(BaseModel):
    agent_run_id: uuid.UUID
    reply: str
    writes: list[dict]
    conversation_id: uuid.UUID | None = None


class ConversationMessage(BaseModel):
    role: str  # user | assistant
    text: str
    writes: list[dict] = []
    run_id: uuid.UUID | None = None


class ConversationOut(BaseModel):
    id: uuid.UUID
    messages: list[ConversationMessage]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=AgentResponse)
async def agent_chat(
    payload: ChatRequest,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AgentResponse:
    if len(payload.message) > MAX_CHAT_MESSAGE_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=CHAT_MESSAGE_TOO_LONG_DETAIL,
        )

    # Resolve the target thread (the caller's chosen one, else the current one),
    # then seed the whole conversation so far so the model keeps context.
    if payload.conversation_id is not None:
        conversation_id = payload.conversation_id
    else:
        conversation_id = (await get_or_create_current(db, user.id)).id

    history = await build_history_messages(db, conversation_id)
    result = await run_agent(
        db, "chat", payload.message, conversation_id=conversation_id, history=history
    )
    await db.commit()
    return AgentResponse(
        agent_run_id=result.agent_run_id,
        reply=result.reply,
        writes=result.writes,
        conversation_id=conversation_id,
    )


@router.get("/conversation/current", response_model=ConversationOut)
async def get_current_conversation_route(
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> ConversationOut:
    """The user's active thread + its messages (lazily creating one if none)."""
    conv = await get_or_create_current(db, user.id)
    await db.commit()
    messages = await reconstruct_messages(db, conv.id)
    return ConversationOut(
        id=conv.id,
        messages=[ConversationMessage(**m) for m in messages],
    )


@router.post("/conversation/new", response_model=ConversationOut)
async def new_conversation_route(
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> ConversationOut:
    """Start a fresh thread; it becomes the user's current conversation."""
    conv = await create_conversation(db, user.id)
    await db.commit()
    return ConversationOut(id=conv.id, messages=[])


@router.post("/capture", response_model=CaptureAgentResponse)
async def agent_capture(
    payload: CaptureRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> CaptureAgentResponse:
    capture, result, writes, run_id = await capture_svc.create_capture(db, payload)
    await db.commit()
    await db.refresh(capture)
    reply = (
        "Capture preview ready."
        if capture.status == "previewed"
        else "Captured to inbox for review."
        if capture.status == "inboxed"
        else "Captured and applied."
    )
    return CaptureAgentResponse(
        agent_run_id=run_id,
        reply=reply,
        writes=writes,
        capture=CaptureOut.model_validate(capture),
        result=result,
    )


@router.post("/captures/{capture_id}/apply", response_model=CaptureApplyResponse)
async def apply_capture(
    capture_id: uuid.UUID,
    payload: CaptureApplyRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> CaptureApplyResponse:
    capture = await capture_svc.get_capture(db, capture_id)
    if capture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capture not found")
    capture, writes, run_id = await capture_svc.apply_capture(db, capture, payload)
    await db.commit()
    await db.refresh(capture)
    return CaptureApplyResponse(
        agent_run_id=run_id,
        reply="Capture applied.",
        writes=writes,
        capture=CaptureOut.model_validate(capture),
    )


@router.post("/captures/{capture_id}/inbox", response_model=CaptureApplyResponse)
async def inbox_capture(
    capture_id: uuid.UUID,
    payload: CaptureInboxRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> CaptureApplyResponse:
    capture = await capture_svc.get_capture(db, capture_id)
    if capture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capture not found")
    capture, writes, run_id = await capture_svc.send_capture_to_inbox(db, capture, payload)
    await db.commit()
    await db.refresh(capture)
    return CaptureApplyResponse(
        agent_run_id=run_id,
        reply="Capture sent to inbox.",
        writes=writes,
        capture=CaptureOut.model_validate(capture),
    )


@router.post("/captures/{capture_id}/dismiss", response_model=CaptureApplyResponse)
async def dismiss_capture(
    capture_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> CaptureApplyResponse:
    capture = await capture_svc.get_capture(db, capture_id)
    if capture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capture not found")
    capture, writes, run_id = await capture_svc.dismiss_capture(db, capture)
    await db.commit()
    await db.refresh(capture)
    return CaptureApplyResponse(
        agent_run_id=run_id,
        reply="Capture dismissed.",
        writes=writes,
        capture=CaptureOut.model_validate(capture),
    )


@router.post("/runs/{run_id}/revert")
async def revert_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.agent_run_id == run_id,
            AuditLog.reverted.is_(False),
        )
        .order_by(AuditLog.created_at.desc())
    )
    rows = list((await db.execute(stmt)).scalars().all())

    if not rows:
        # Check if the run_id exists at all (any audit row, even reverted)
        any_stmt = select(AuditLog).where(AuditLog.agent_run_id == run_id).limit(1)
        any_row = (await db.execute(any_stmt)).scalar_one_or_none()
        if any_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
        # All already reverted
        return {"reverted": 0}

    reverted_count = 0
    for audit in rows:
        try:
            await revert_audit(db, audit, surface="ui", actor="user")
            reverted_count += 1
        except Exception:  # noqa: BLE001
            pass

    await db.commit()
    return {"reverted": reverted_count}


# ---------------------------------------------------------------------------
# SOUL / persona  (GET / PUT / reset)
# ---------------------------------------------------------------------------

def _persona_out(persona: AgentPersona | None) -> PersonaOut:
    """Serialize the persona row, or the built-in default when absent."""
    if persona is None:
        return PersonaOut(
            name=DEFAULT_PERSONA.name,
            role=DEFAULT_PERSONA.role,
            tone=DEFAULT_PERSONA.tone,
            greeting=DEFAULT_PERSONA.greeting,
            instructions=DEFAULT_PERSONA.instructions,
            principles=DEFAULT_PERSONA.principles,
            boundaries=DEFAULT_PERSONA.boundaries,
            enabled=DEFAULT_PERSONA.enabled,
            is_default=True,
        )
    return PersonaOut.model_validate(persona)


@router.get("/persona", response_model=PersonaOut)
async def get_persona_route(
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> PersonaOut:
    persona = await get_persona(db)
    return _persona_out(persona)


@router.put("/persona", response_model=PersonaOut)
async def put_persona_route(
    payload: PersonaUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> PersonaOut:
    existing = await get_persona(db)
    before = model_to_dict(existing) if existing is not None else None

    persona = await upsert_persona(db, **payload.model_dump(exclude_unset=True))

    # Record through the audit/undo write-path so persona edits are reversible
    # from the Activity page.
    if existing is None:
        await record_create(db, "agent_persona", persona, actor="user", surface="ui")
    else:
        await record_update(db, "agent_persona", persona, before or {}, actor="user", surface="ui")

    await db.commit()
    await db.refresh(persona)
    return PersonaOut.model_validate(persona)


@router.post("/persona/reset", response_model=PersonaOut)
async def reset_persona_route(
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> PersonaOut:
    """Restore the built-in default SOUL (clears every editable field)."""
    existing = await get_persona(db)
    before = model_to_dict(existing) if existing is not None else None

    persona = await reset_persona(db)

    if existing is None:
        await record_create(db, "agent_persona", persona, actor="user", surface="ui")
    else:
        await record_update(db, "agent_persona", persona, before or {}, actor="user", surface="ui")

    await db.commit()
    await db.refresh(persona)
    return PersonaOut.model_validate(persona)
