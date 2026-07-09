import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.task import Task, TaskRecurrence
from app.schemas.task import TaskCreate, TaskUpdate
from app.services import task_recurrence as recurrence_svc
from app.services.pagination import apply_window, count_rows

ENTITY = "task"
RECURRENCE_ENTITY = "task_recurrence"
ACTIVE_INSTANCE_STATUSES = {"open", "in_progress"}


async def list_tasks(
    db: AsyncSession, *, limit: int | None = None, offset: int = 0
) -> list[Task]:
    stmt = apply_window(
        select(Task).options(selectinload(Task.recurrence)).order_by(Task.created_at),
        limit=limit,
        offset=offset,
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_tasks(db: AsyncSession) -> int:
    return await count_rows(db, select(Task))


async def get_task(db: AsyncSession, task_id: uuid.UUID) -> Task | None:
    return await db.get(Task, task_id, options=(selectinload(Task.recurrence),))


async def search_tasks(db: AsyncSession, q: str, *, limit: int = 10) -> list[Task]:
    """Title substring lookup — reliable without the search index."""
    term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    stmt = (
        select(Task)
        .where(Task.title.ilike(f"%{term}%", escape="\\"))
        .order_by(Task.created_at.desc())
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_task(db: AsyncSession, data: TaskCreate, *, surface: str = "api") -> Task:
    if data.recurrence is None:
        obj = Task(**data.model_dump(exclude={"recurrence"}))
        db.add(obj)
        await db.flush()
        await record_create(db, ENTITY, obj, surface=surface)
        return obj

    recurrence = _recurrence_from_task_create(data)
    db.add(recurrence)
    await db.flush()
    await record_create(db, RECURRENCE_ENTITY, recurrence, surface=surface)

    obj = recurrence_svc.generated_task(
        recurrence, recurrence_svc.first_occurrence(recurrence)
    )
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_task(
    db: AsyncSession, obj: Task, data: TaskUpdate, *, surface: str = "api"
) -> Task:
    previous_status = obj.status
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    if obj.status == "done" and obj.completed_at is None:
        obj.completed_at = datetime.now(UTC)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    if previous_status != "done" and obj.status == "done":
        await _maybe_generate_next_recurrence_task(db, obj, surface=surface)
    return obj


async def delete_task(db: AsyncSession, obj: Task, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)


def _recurrence_from_task_create(data: TaskCreate) -> TaskRecurrence:
    if data.recurrence is None:
        raise ValueError("recurrence is required")
    payload = data.model_dump(exclude={"recurrence", "status", "due", "scheduled"})
    recurrence_payload = data.recurrence.model_dump()
    weekday, month_day = recurrence_svc.normalize_rule(
        recurrence_payload["frequency"],
        recurrence_payload.get("weekday"),
        recurrence_payload.get("month_day"),
    )
    recurrence_payload["weekday"] = weekday
    recurrence_payload["month_day"] = month_day
    return TaskRecurrence(**payload, **recurrence_payload)


async def _maybe_generate_next_recurrence_task(
    db: AsyncSession, task: Task, *, surface: str
) -> Task | None:
    if task.recurrence_id is None:
        return None
    recurrence = await recurrence_svc.get_task_recurrence(db, task.recurrence_id)
    if recurrence is None or not recurrence.active:
        return None

    stmt = select(Task).where(
        Task.recurrence_id == recurrence.id,
        Task.id != task.id,
        Task.status.in_(ACTIVE_INSTANCE_STATUSES),
    )
    existing = (await db.execute(stmt)).scalars().first()
    if existing is not None:
        return None

    anchor = task.scheduled or recurrence.start_date
    today = date.today()
    if anchor < today:
        anchor = today
    next_task = recurrence_svc.generated_task(
        recurrence, recurrence_svc.next_occurrence_after(recurrence, anchor)
    )
    db.add(next_task)
    await db.flush()
    await record_create(db, ENTITY, next_task, surface=surface)
    return next_task
