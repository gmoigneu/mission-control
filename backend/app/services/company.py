import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.company import Company
from app.schemas.company import CompanyCreate, CompanyUpdate
from app.search.index import deindex_subject, index_subject
from app.services.pagination import apply_window, count_rows

ENTITY = "company"


async def list_companies(
    db: AsyncSession, *, limit: int | None = None, offset: int = 0
) -> list[Company]:
    stmt = apply_window(
        select(Company).order_by(Company.created_at), limit=limit, offset=offset
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_companies(db: AsyncSession) -> int:
    return await count_rows(db, select(Company))


async def get_company(db: AsyncSession, company_id: uuid.UUID) -> Company | None:
    return await db.get(Company, company_id)


async def create_company(db: AsyncSession, data: CompanyCreate, *, surface: str = "api") -> Company:
    obj = Company(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_company(
    db: AsyncSession, obj: Company, data: CompanyUpdate, *, surface: str = "api"
) -> Company:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_company(db: AsyncSession, obj: Company, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)
