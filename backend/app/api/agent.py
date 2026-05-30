"""Agent API — /agent/chat, /agent/capture, /agent/runs/{run_id}/revert."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.agent import run_agent
from app.audit.revert import revert_audit
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
