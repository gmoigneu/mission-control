import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, set_pagination_headers
from app.audit.revert import revert_audit
from app.db import get_db
from app.deps import get_current_user
from app.models.audit import AuditLog
from app.schemas.audit import AuditOut
from app.services.pagination import count_rows

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
    base = select(AuditLog)
    if entity_type is not None:
        base = base.where(AuditLog.entity_type == entity_type)
    if surface is not None:
        base = base.where(AuditLog.surface == surface)

    total = await count_rows(db, base)
    set_pagination_headers(response, total=total, page=Page(limit=limit, offset=offset))

    stmt = base.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
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
