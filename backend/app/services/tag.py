import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.tag import Tag
from app.schemas.tag import TagCreate, TagUpdate

ENTITY = "tag"


async def list_tags(db: AsyncSession) -> list[Tag]:
    result = await db.execute(select(Tag).order_by(Tag.name))
    return list(result.scalars().all())


async def get_tag(db: AsyncSession, tag_id: uuid.UUID) -> Tag | None:
    return await db.get(Tag, tag_id)


async def create_tag(db: AsyncSession, data: TagCreate, *, surface: str = "api") -> Tag:
    obj = Tag(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_tag(db: AsyncSession, obj: Tag, data: TagUpdate, *, surface: str = "api") -> Tag:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_tag(db: AsyncSession, obj: Tag, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
