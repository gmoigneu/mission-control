import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.relationship import Relationship
from app.schemas.relationship import RelationshipCreate, RelationshipUpdate

ENTITY = "relationship"


async def list_relationships(db: AsyncSession) -> list[Relationship]:
    result = await db.execute(select(Relationship).order_by(Relationship.created_at))
    return list(result.scalars().all())


async def get_relationship(db: AsyncSession, relationship_id: uuid.UUID) -> Relationship | None:
    return await db.get(Relationship, relationship_id)


async def create_relationship(
    db: AsyncSession, data: RelationshipCreate, *, surface: str = "api"
) -> Relationship:
    obj = Relationship(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_relationship(
    db: AsyncSession, obj: Relationship, data: RelationshipUpdate, *, surface: str = "api"
) -> Relationship:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_relationship(
    db: AsyncSession, obj: Relationship, *, surface: str = "api"
) -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
