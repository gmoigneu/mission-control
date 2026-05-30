import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.person import Person
from app.schemas.person import PersonCreate, PersonUpdate
from app.search.index import deindex_subject, index_subject

ENTITY = "person"


async def list_people(
    db: AsyncSession, *, limit: int = 50, offset: int = 0
) -> list[Person]:
    stmt = select(Person).order_by(Person.created_at).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_people(db: AsyncSession) -> int:
    return await db.scalar(select(func.count()).select_from(Person)) or 0


async def get_person(db: AsyncSession, person_id: uuid.UUID) -> Person | None:
    return await db.get(Person, person_id)


async def create_person(db: AsyncSession, data: PersonCreate, *, surface: str = "api") -> Person:
    obj = Person(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_person(
    db: AsyncSession, obj: Person, data: PersonUpdate, *, surface: str = "api"
) -> Person:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_person(db: AsyncSession, obj: Person, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)
