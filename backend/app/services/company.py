import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyUpdate
from app.services.pagination import apply_window, count_rows

ENTITY = "company"


async def list_companies(
    db: AsyncSession, *, limit: int | None = None, offset: int = 0
) -> list[Company]:
    stmt = apply_window(
        select(Company).order_by(func.lower(Company.name)), limit=limit, offset=offset
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_companies(db: AsyncSession) -> int:
    return await count_rows(db, select(Company))


async def get_company(db: AsyncSession, company_id: uuid.UUID) -> Company | None:
    return await db.get(Company, company_id)


async def search_companies(db: AsyncSession, q: str, *, limit: int = 10) -> list[Company]:
    """Name/slug substring lookup — reliable without the search index."""
    pattern = f"%{q.strip()}%"
    stmt = (
        select(Company)
        .where(or_(Company.name.ilike(pattern), Company.slug.ilike(pattern)))
        .order_by(func.lower(Company.name))
        .limit(limit)
    )
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
