import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete
from app.models.task_link import TaskLink
from app.schemas.task_link import TaskLinkCreate
from app.services.pagination import apply_window, count_rows

ENTITY = "task_link"


async def list_task_links(
    db: AsyncSession,
    from_task_id: uuid.UUID | None = None,
    to_task_id: uuid.UUID | None = None,
    *,
    limit: int | None = None,
    offset: int = 0,
) -> list[TaskLink]:
    stmt = _task_links_query(from_task_id=from_task_id, to_task_id=to_task_id)
    stmt = apply_window(stmt.order_by(TaskLink.created_at), limit=limit, offset=offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_task_links(
    db: AsyncSession,
    from_task_id: uuid.UUID | None = None,
    to_task_id: uuid.UUID | None = None,
) -> int:
    return await count_rows(
        db, _task_links_query(from_task_id=from_task_id, to_task_id=to_task_id)
    )


def _task_links_query(
    *,
    from_task_id: uuid.UUID | None = None,
    to_task_id: uuid.UUID | None = None,
):
    stmt = select(TaskLink)
    if from_task_id is not None:
        stmt = stmt.where(TaskLink.from_task_id == from_task_id)
    if to_task_id is not None:
        stmt = stmt.where(TaskLink.to_task_id == to_task_id)
    return stmt


async def get_task_link(db: AsyncSession, task_link_id: uuid.UUID) -> TaskLink | None:
    return await db.get(TaskLink, task_link_id)


async def create_task_link(
    db: AsyncSession, data: TaskLinkCreate, *, surface: str = "api"
) -> TaskLink:
    obj = TaskLink(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def delete_task_link(db: AsyncSession, obj: TaskLink, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
