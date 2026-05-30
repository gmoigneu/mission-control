import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.revert import revert_audit
from app.db import get_db
from app.deps import get_current_user
from app.models.audit import AuditLog
from app.schemas.audit import AuditOut

router = APIRouter(prefix="/audit", tags=["audit"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[AuditOut])
async def list_audit(limit: int = 100, db: AsyncSession = Depends(get_db)):  # noqa: B008
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.post("/{audit_id}/revert", response_model=AuditOut)
async def revert(audit_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    audit = await db.get(AuditLog, audit_id)
    if audit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    result = await revert_audit(db, audit, surface="ui")
    await db.commit()
    return result
