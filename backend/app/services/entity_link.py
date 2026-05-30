import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete
from app.models.entity_link import EntityLink
from app.schemas.entity_link import EntityLinkCreate

ENTITY = "entity_link"


async def list_entity_links(
    db: AsyncSession,
    from_type: str | None = None,
    from_id: uuid.UUID | None = None,
    to_type: str | None = None,
    to_id: uuid.UUID | None = None,
) -> list[EntityLink]:
    stmt = select(EntityLink)
    if from_type is not None:
        stmt = stmt.where(EntityLink.from_type == from_type)
    if from_id is not None:
        stmt = stmt.where(EntityLink.from_id == from_id)
    if to_type is not None:
        stmt = stmt.where(EntityLink.to_type == to_type)
    if to_id is not None:
        stmt = stmt.where(EntityLink.to_id == to_id)
    result = await db.execute(stmt.order_by(EntityLink.created_at))
    return list(result.scalars().all())


async def get_entity_link(db: AsyncSession, entity_link_id: uuid.UUID) -> EntityLink | None:
    return await db.get(EntityLink, entity_link_id)


async def create_entity_link(
    db: AsyncSession, data: EntityLinkCreate, *, surface: str = "api"
) -> EntityLink:
    obj = EntityLink(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def delete_entity_link(db: AsyncSession, obj: EntityLink, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
