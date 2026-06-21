import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.telos import Telos
from app.schemas.telos import TelosCreate, TelosUpdate
from app.services.pagination import apply_window, count_rows

ENTITY = "telos"


async def list_telos(
    db: AsyncSession, *, limit: int | None = None, offset: int = 0
) -> list[Telos]:
    stmt = apply_window(select(Telos).order_by(Telos.created_at), limit=limit, offset=offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_telos(db: AsyncSession) -> int:
    return await count_rows(db, select(Telos))


async def get_telos(db: AsyncSession, telos_id: uuid.UUID) -> Telos | None:
    return await db.get(Telos, telos_id)


async def create_telos(db: AsyncSession, data: TelosCreate, *, surface: str = "api") -> Telos:
    obj = Telos(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_telos(
    db: AsyncSession, obj: Telos, data: TelosUpdate, *, surface: str = "api"
) -> Telos:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_telos(db: AsyncSession, obj: Telos, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
