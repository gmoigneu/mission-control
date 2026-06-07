import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.context import Context
from app.schemas.context import ContextCreate, ContextUpdate
from app.services.pagination import apply_window, count_rows

ENTITY = "context"


async def list_contexts(
    db: AsyncSession, *, limit: int | None = None, offset: int = 0
) -> list[Context]:
    stmt = apply_window(
        select(Context).order_by(Context.created_at), limit=limit, offset=offset
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_contexts(db: AsyncSession) -> int:
    return await count_rows(db, select(Context))


async def get_context(db: AsyncSession, context_id: uuid.UUID) -> Context | None:
    return await db.get(Context, context_id)


async def search_contexts(db: AsyncSession, q: str, *, limit: int = 10) -> list[Context]:
    """Name/slug substring lookup — reliable without the search index."""
    pattern = f"%{q.strip()}%"
    stmt = (
        select(Context)
        .where(or_(Context.name.ilike(pattern), Context.slug.ilike(pattern)))
        .order_by(Context.name)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_context(db: AsyncSession, data: ContextCreate, *, surface: str = "api") -> Context:
    obj = Context(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_context(
    db: AsyncSession, obj: Context, data: ContextUpdate, *, surface: str = "api"
) -> Context:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_context(db: AsyncSession, obj: Context, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
