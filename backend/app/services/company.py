import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyUpdate
from app.services.pagination import apply_window, count_rows

ENTITY = "company"


def _search_filter(q: str):
    pattern = f"%{q.strip()}%"
    return or_(
        Company.name.ilike(pattern),
        Company.slug.ilike(pattern),
        Company.domain.ilike(pattern),
        Company.notes.ilike(pattern),
    )


def _list_stmt(q: str | None = None):
    stmt = select(Company)
    if q and q.strip():
        stmt = stmt.where(_search_filter(q))
    return stmt.order_by(func.lower(Company.name))


async def list_companies(
    db: AsyncSession, *, q: str | None = None, limit: int | None = None, offset: int = 0
) -> list[Company]:
    stmt = apply_window(_list_stmt(q), limit=limit, offset=offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_companies(db: AsyncSession, *, q: str | None = None) -> int:
    return await count_rows(db, _list_stmt(q))


async def get_company(db: AsyncSession, company_id: uuid.UUID) -> Company | None:
    return await db.get(Company, company_id)


async def get_company_by_slug(db: AsyncSession, slug: str) -> Company | None:
    result = await db.execute(select(Company).where(Company.slug == slug))
    return result.scalar_one_or_none()


async def search_companies(db: AsyncSession, q: str, *, limit: int = 10) -> list[Company]:
    """Substring lookup across company text fields — reliable without the search index."""
    stmt = _list_stmt(q).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def create_company(db: AsyncSession, data: CompanyCreate, *, surface: str = "api") -> Company:
    obj = Company(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_company(
    db: AsyncSession, obj: Company, data: CompanyUpdate, *, surface: str = "api"
) -> Company:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_company(db: AsyncSession, obj: Company, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
