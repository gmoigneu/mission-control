"""Agent API — /agent/chat, /agent/capture, /agent/runs/{run_id}/revert."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.agent import run_agent
from app.agent.persona_store import (
    DEFAULT_PERSONA,
    compose_system,
    get_persona,
    upsert_persona,
)
from app.audit.revert import revert_audit
from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_update
from app.db import get_db
from app.deps import get_current_user
from app.models.audit import AuditLog

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


class CaptureRequest(BaseModel):
    text: str


class AgentResponse(BaseModel):
    agent_run_id: uuid.UUID
    reply: str
    writes: list[dict]


class PersonaResponse(BaseModel):
    name: str
    role: str | None = None
    tone: str | None = None
    greeting: str | None = None
    instructions: str | None = None
    principles: str | None = None
    boundaries: str | None = None
    enabled: bool = True
    # Read-only preview of the composed system prompt (SOUL + chat mechanics).
    preview: str


class PersonaUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    tone: str | None = None
    greeting: str | None = None
    instructions: str | None = None
    principles: str | None = None
    boundaries: str | None = None
    enabled: bool | None = None


def _persona_response(persona) -> PersonaResponse:  # noqa: ANN001
    """Build the API response from a persona row or the built-in default."""
    src = persona if persona is not None else DEFAULT_PERSONA
    return PersonaResponse(
        name=src.name,
        role=src.role,
        tone=src.tone,
        greeting=src.greeting,
        instructions=src.instructions,
        principles=src.principles,
        boundaries=src.boundaries,
        enabled=src.enabled,
        preview=compose_system(persona, "chat"),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=AgentResponse)
async def agent_chat(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AgentResponse:
    result = await run_agent(db, "chat", payload.message)
    await db.commit()
    return AgentResponse(
        agent_run_id=result.agent_run_id,
        reply=result.reply,
        writes=result.writes,
    )


@router.post("/capture", response_model=AgentResponse)
async def agent_capture(
    payload: CaptureRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AgentResponse:
    result = await run_agent(db, "capture", payload.text)
    await db.commit()
    return AgentResponse(
        agent_run_id=result.agent_run_id,
        reply=result.reply,
        writes=result.writes,
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
# Persona ("SOUL") configuration
# ---------------------------------------------------------------------------

@router.get("/persona", response_model=PersonaResponse)
async def get_agent_persona(
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> PersonaResponse:
    """Return the configured persona, or the built-in defaults when unset."""
    persona = await get_persona(db)
    return _persona_response(persona)


@router.put("/persona", response_model=PersonaResponse)
async def put_agent_persona(
    payload: PersonaUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> PersonaResponse:
    """Upsert the persona and record the change through the audit write-path."""
    existing = await get_persona(db)
    fields = payload.model_dump(exclude_unset=True)

    if existing is None:
        persona = await upsert_persona(db, **fields)
        await record_create(db, "agent_persona", persona, surface="ui")
    else:
        before = model_to_dict(existing)
        persona = await upsert_persona(db, **fields)
        await record_update(db, "agent_persona", persona, before, surface="ui")

    await db.commit()
    return _persona_response(persona)


@router.post("/persona/reset", response_model=PersonaResponse)
async def reset_agent_persona(
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> PersonaResponse:
    """Restore the built-in default SOUL, recording the change in Activity."""
    existing = await get_persona(db)
    defaults = {
        "name": DEFAULT_PERSONA.name,
        "role": DEFAULT_PERSONA.role,
        "tone": DEFAULT_PERSONA.tone,
        "greeting": DEFAULT_PERSONA.greeting,
        "instructions": DEFAULT_PERSONA.instructions,
        "principles": DEFAULT_PERSONA.principles,
        "boundaries": DEFAULT_PERSONA.boundaries,
        "enabled": DEFAULT_PERSONA.enabled,
    }

    if existing is None:
        persona = await upsert_persona(db, **defaults)
        await record_create(db, "agent_persona", persona, surface="ui")
    else:
        before = model_to_dict(existing)
        persona = await upsert_persona(db, **defaults)
        await record_update(db, "agent_persona", persona, before, surface="ui")

    await db.commit()
    return _persona_response(persona)
