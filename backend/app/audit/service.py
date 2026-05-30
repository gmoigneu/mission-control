import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.context import agent_run_id_var
from app.audit.serialize import model_to_dict
from app.models.audit import AuditLog
from app.models.outbox import CHANNEL_GRAPH, CHANNEL_SEARCH, OutboxEvent


def _emit(
    db: AsyncSession, entity_type: str, entity_id: Any, op: str, payload: dict | None
) -> None:
    """Fan a single change out to every outbox consumer.

    Both the Neo4j projector and the semantic indexer are decoupled from the
    request path: each drains its own channel, so search/graph work happens in
    the worker rather than inline in the user's write transaction.
    """
    for channel in (CHANNEL_GRAPH, CHANNEL_SEARCH):
        db.add(
            OutboxEvent(
                channel=channel,
                aggregate_type=entity_type,
                aggregate_id=entity_id,
                op=op,
                payload=payload,
            )
        )


async def record_create(
    db: AsyncSession, entity_type: str, obj: Any, *, actor: str = "user", surface: str = "api"
) -> AuditLog:
    after = model_to_dict(obj)
    entry = AuditLog(
        actor=actor, action="create", entity_type=entity_type, entity_id=obj.id,
        before=None, after=after, surface=surface,
        agent_run_id=agent_run_id_var.get(),
    )
    db.add(entry)
    _emit(db, entity_type, obj.id, "upsert", after)
    return entry


async def record_update(
    db: AsyncSession, entity_type: str, obj: Any, before: dict, *,
    actor: str = "user", surface: str = "api"
) -> AuditLog:
    await db.refresh(obj)
    after = model_to_dict(obj)
    entry = AuditLog(
        actor=actor, action="update", entity_type=entity_type, entity_id=obj.id,
        before=before, after=after, surface=surface,
        agent_run_id=agent_run_id_var.get(),
    )
    db.add(entry)
    _emit(db, entity_type, obj.id, "upsert", after)
    return entry


async def record_delete(
    db: AsyncSession, entity_type: str, before: dict, entity_id: uuid.UUID, *,
    actor: str = "user", surface: str = "api",
) -> AuditLog:
    entry = AuditLog(
        actor=actor, action="delete", entity_type=entity_type, entity_id=entity_id,
        before=before, after=None, surface=surface,
        agent_run_id=agent_run_id_var.get(),
    )
    db.add(entry)
    _emit(db, entity_type, entity_id, "delete", before)
    return entry
