from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.registry import ENTITY_MODELS
from app.audit.serialize import coerce_value, model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.audit import AuditLog

# Re-indexing is decoupled: record_* emits a search outbox event the search
# worker drains, so revert no longer needs to (de)index inline.


async def revert_audit(
    db: AsyncSession, audit: AuditLog, *, actor: str = "user", surface: str = "api"
) -> AuditLog:
    if audit.reverted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already reverted")
    model = ENTITY_MODELS.get(audit.entity_type)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot revert entity type '{audit.entity_type}'",
        )

    if audit.action == "create":
        obj: Any = await db.get(model, audit.entity_id)
        if obj is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Entity already deleted; nothing to revert",
            )
        before = model_to_dict(obj)
        await db.delete(obj)
        await db.flush()
        await record_delete(
            db, audit.entity_type, before, audit.entity_id, actor=actor, surface=surface
        )
    elif audit.action == "update":
        obj = await db.get(model, audit.entity_id)
        if obj is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Entity no longer exists"
            )
        before = model_to_dict(obj)
        for key, value in (audit.before or {}).items():
            setattr(obj, key, coerce_value(model, key, value))
        await db.flush()
        await record_update(db, audit.entity_type, obj, before, actor=actor, surface=surface)
    elif audit.action == "delete":
        data = {key: coerce_value(model, key, value) for key, value in (audit.before or {}).items()}
        obj = model(**data)
        db.add(obj)
        await db.flush()
        await record_create(db, audit.entity_type, obj, actor=actor, surface=surface)

    audit.reverted = True
    await db.flush()
    return audit
