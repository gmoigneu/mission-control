import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.revert import revert_audit
from app.db import get_db
from app.deps import get_current_user
from app.models.audit import AuditLog
from app.schemas.audit import AuditOut

router = APIRouter(prefix="/audit", tags=["audit"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[AuditOut])
async def list_audit(  # noqa: B008
    response: Response,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    entity_type: str | None = None,
    surface: str | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    count_stmt = select(func.count()).select_from(AuditLog)
    if entity_type is not None:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
        count_stmt = count_stmt.where(AuditLog.entity_type == entity_type)
    if surface is not None:
        stmt = stmt.where(AuditLog.surface == surface)
        count_stmt = count_stmt.where(AuditLog.surface == surface)
    total = await db.scalar(count_stmt)
    response.headers["X-Total-Count"] = str(total or 0)
    stmt = stmt.limit(limit).offset(offset)
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
