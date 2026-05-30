import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.revert import revert_audit
from app.db import get_db
from app.deps import get_current_user
from app.models.audit import AuditLog
from app.schemas.audit import AuditOut

router = APIRouter(prefix="/audit", tags=["audit"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[AuditOut])
async def list_audit(  # noqa: B008
    limit: int = Query(default=100, ge=1, le=1000),
    entity_type: str | None = None,
    surface: str | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if entity_type is not None:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if surface is not None:
        stmt = stmt.where(AuditLog.surface == surface)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/{audit_id}/revert", response_model=AuditOut)
async def revert(audit_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    audit = await db.get(AuditLog, audit_id)
    if audit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    result = await revert_audit(db, audit, surface="ui")
    await db.commit()
    return result
