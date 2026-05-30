import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.models.audit import AuditLog
from app.models.outbox import OutboxEvent


async def record_create(
    db: AsyncSession, entity_type: str, obj: Any, *, actor: str = "user", surface: str = "api"
) -> AuditLog:
    after = model_to_dict(obj)
    entry = AuditLog(
        actor=actor, action="create", entity_type=entity_type, entity_id=obj.id,
        before=None, after=after, surface=surface,
    )
    db.add(entry)
    db.add(OutboxEvent(aggregate_type=entity_type, aggregate_id=obj.id, op="upsert", payload=after))
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
    )
    db.add(entry)
    db.add(OutboxEvent(aggregate_type=entity_type, aggregate_id=obj.id, op="upsert", payload=after))
    return entry


async def record_delete(
    db: AsyncSession, entity_type: str, before: dict, entity_id: uuid.UUID, *,
    actor: str = "user", surface: str = "api",
) -> AuditLog:
    entry = AuditLog(
        actor=actor, action="delete", entity_type=entity_type, entity_id=entity_id,
        before=before, after=None, surface=surface,
    )
    db.add(entry)
    db.add(
        OutboxEvent(
            aggregate_type=entity_type, aggregate_id=entity_id, op="delete", payload=before
        )
    )
    return entry
