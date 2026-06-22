import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.proactive_run import ProactiveRun
from app.schemas.proactive_run import ProactiveRunCreate, ProactiveRunUpdate, json_ready


async def list_proactive_runs(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    routine_type: str | None = None,
    outcome: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[ProactiveRun]:
    stmt = select(ProactiveRun).where(ProactiveRun.user_id == user_id)
    if routine_type is not None:
        stmt = stmt.where(ProactiveRun.routine_type == routine_type)
    if outcome is not None:
        stmt = stmt.where(ProactiveRun.outcome == outcome)
    result = await db.execute(
        stmt.order_by(ProactiveRun.created_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all())


async def count_proactive_runs(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    routine_type: str | None = None,
    outcome: str | None = None,
) -> int:
    stmt = select(func.count()).select_from(ProactiveRun).where(ProactiveRun.user_id == user_id)
    if routine_type is not None:
        stmt = stmt.where(ProactiveRun.routine_type == routine_type)
    if outcome is not None:
        stmt = stmt.where(ProactiveRun.outcome == outcome)
    return int((await db.execute(stmt)).scalar_one())


async def get_proactive_run(
    db: AsyncSession, *, user_id: uuid.UUID, run_id: uuid.UUID
) -> ProactiveRun | None:
    result = await db.execute(
        select(ProactiveRun).where(ProactiveRun.id == run_id, ProactiveRun.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def create_proactive_run(
    db: AsyncSession, *, user_id: uuid.UUID, data: ProactiveRunCreate
) -> ProactiveRun:
    payload = json_ready(data.model_dump())
    obj = ProactiveRun(**payload, user_id=user_id)
    db.add(obj)
    await db.flush()
    return obj


async def update_proactive_run(
    db: AsyncSession, obj: ProactiveRun, data: ProactiveRunUpdate
) -> ProactiveRun:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, json_ready(value))
    await db.flush()
    await db.refresh(obj)
    return obj


async def dismiss_proactive_run(db: AsyncSession, obj: ProactiveRun) -> ProactiveRun:
    obj.outcome = "dismissed"
    obj.dismissed_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(obj)
    return obj


async def mute_proactive_run(db: AsyncSession, obj: ProactiveRun) -> ProactiveRun:
    obj.outcome = "muted"
    obj.muted_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(obj)
    return obj
