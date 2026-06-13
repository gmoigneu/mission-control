"""Chat thread persistence — the store behind /agent/conversation.

A conversation's full message history is the ordered concatenation of its
``agent_run`` transcripts. Each run stores only *its* turn (user input + tool
calls + Aya's reply), so concatenating them reproduces the whole thread with no
duplication. The user's *current* thread is their most recently created
conversation; ``/new`` simply inserts a fresh one.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_conversation import AgentConversation
from app.models.agent_run import AgentRun
from app.models.audit import AuditLog


async def get_current_conversation(
    db: AsyncSession, user_id: uuid.UUID
) -> AgentConversation | None:
    """Return the user's most recently created conversation, or ``None``."""
    stmt = (
        select(AgentConversation)
        .where(AgentConversation.user_id == user_id)
        .order_by(AgentConversation.created_at.desc(), AgentConversation.id.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_conversation(db: AsyncSession, user_id: uuid.UUID) -> AgentConversation:
    """Insert a fresh conversation for the user and return it (now current)."""
    conv = AgentConversation(user_id=user_id)
    db.add(conv)
    await db.flush()
    return conv


async def get_or_create_current(db: AsyncSession, user_id: uuid.UUID) -> AgentConversation:
    """Return the current conversation, creating an empty one if none exists."""
    existing = await get_current_conversation(db, user_id)
    if existing is not None:
        return existing
    return await create_conversation(db, user_id)


async def _ok_runs(db: AsyncSession, conversation_id: uuid.UUID) -> list[AgentRun]:
    """The conversation's successful runs, oldest first."""
    stmt = (
        select(AgentRun)
        .where(
            AgentRun.conversation_id == conversation_id,
            AgentRun.status == "ok",
        )
        .order_by(AgentRun.created_at, AgentRun.id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def build_history_messages(
    db: AsyncSession, conversation_id: uuid.UUID
) -> list[dict]:
    """Seed messages for a new turn: every prior ok run's transcript, in order.

    Errored/partial runs are skipped so we never feed the model a dangling
    ``tool_use`` with no matching ``tool_result``.
    """
    history: list[dict] = []
    for run in await _ok_runs(db, conversation_id):
        if run.transcript:
            history.extend(run.transcript)
    return history


async def reconstruct_messages(
    db: AsyncSession, conversation_id: uuid.UUID
) -> list[dict]:
    """Rebuild the UI-facing transcript (user/assistant bubbles) for a thread.

    Each ok run yields a user message (its input) and an assistant message (its
    stored reply, plus the entity writes it produced and the run id for Undo).
    """
    runs = await _ok_runs(db, conversation_id)
    if not runs:
        return []

    run_ids = [run.id for run in runs]
    writes_by_run: dict[uuid.UUID, list[dict]] = {rid: [] for rid in run_ids}
    audit_stmt = (
        select(AuditLog)
        .where(AuditLog.agent_run_id.in_(run_ids))
        .order_by(AuditLog.created_at)
    )
    for audit in (await db.execute(audit_stmt)).scalars().all():
        writes_by_run.setdefault(audit.agent_run_id, []).append(
            {
                "id": str(audit.id),
                "action": audit.action,
                "entity_type": audit.entity_type,
                "entity_id": str(audit.entity_id),
            }
        )

    messages: list[dict] = []
    for run in runs:
        messages.append({"role": "user", "text": run.input})
        messages.append(
            {
                "role": "assistant",
                "text": run.reply or "",
                "writes": writes_by_run.get(run.id, []),
                "run_id": str(run.id),
            }
        )
    return messages
