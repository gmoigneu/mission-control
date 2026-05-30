import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate
from app.search.index import deindex_subject, index_subject

ENTITY = "task"


async def list_tasks(db: AsyncSession) -> list[Task]:
    result = await db.execute(select(Task).order_by(Task.created_at))
    return list(result.scalars().all())


async def get_task(db: AsyncSession, task_id: uuid.UUID) -> Task | None:
    return await db.get(Task, task_id)


async def create_task(db: AsyncSession, data: TaskCreate, *, surface: str = "api") -> Task:
    obj = Task(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_task(
    db: AsyncSession, obj: Task, data: TaskUpdate, *, surface: str = "api"
) -> Task:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_task(db: AsyncSession, obj: Task, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)
