import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.person import Person
from app.schemas.person import PersonCreate, PersonUpdate
from app.services.pagination import apply_window, count_rows

ENTITY = "person"


def _search_filter(q: str):
    pattern = f"%{q.strip()}%"
    return or_(
        Person.name.ilike(pattern),
        Person.slug.ilike(pattern),
        Person.role.ilike(pattern),
        Person.email.ilike(pattern),
        Person.linkedin.ilike(pattern),
        Person.summary.ilike(pattern),
    )


def _list_stmt(q: str | None = None, company_id: uuid.UUID | None = None):
    stmt = select(Person)
    if company_id:
        stmt = stmt.where(Person.company_id == company_id)
    if q and q.strip():
        stmt = stmt.where(_search_filter(q))
    return stmt.order_by(func.lower(Person.name))


async def list_people(
    db: AsyncSession,
    *,
    q: str | None = None,
    company_id: uuid.UUID | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[Person]:
    stmt = apply_window(_list_stmt(q, company_id), limit=limit, offset=offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_people(
    db: AsyncSession, *, q: str | None = None, company_id: uuid.UUID | None = None
) -> int:
    return await count_rows(db, _list_stmt(q, company_id))


async def get_person(db: AsyncSession, person_id: uuid.UUID) -> Person | None:
    return await db.get(Person, person_id)


async def get_person_by_slug(db: AsyncSession, slug: str) -> Person | None:
    result = await db.execute(select(Person).where(Person.slug == slug))
    return result.scalar_one_or_none()


async def search_people(db: AsyncSession, q: str, *, limit: int = 10) -> list[Person]:
    """Substring lookup across person text fields — reliable without the search index."""
    stmt = _list_stmt(q).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def create_person(db: AsyncSession, data: PersonCreate, *, surface: str = "api") -> Person:
    obj = Person(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_person(
    db: AsyncSession, obj: Person, data: PersonUpdate, *, surface: str = "api"
) -> Person:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_person(db: AsyncSession, obj: Person, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
