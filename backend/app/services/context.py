import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.context import Context
from app.schemas.context import ContextCreate, ContextUpdate
from app.search.index import enqueue_deindex, enqueue_index

ENTITY = "context"


async def list_contexts(db: AsyncSession) -> list[Context]:
    result = await db.execute(select(Context).order_by(Context.created_at))
    return list(result.scalars().all())


async def get_context(db: AsyncSession, context_id: uuid.UUID) -> Context | None:
    return await db.get(Context, context_id)


async def create_context(db: AsyncSession, data: ContextCreate, *, surface: str = "api") -> Context:
    obj = Context(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_context(
    db: AsyncSession, obj: Context, data: ContextUpdate, *, surface: str = "api"
) -> Context:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_context(db: AsyncSession, obj: Context, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)
