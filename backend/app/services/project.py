import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.project import Project
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.pagination import apply_window, count_rows

ENTITY = "project"


async def list_projects(
    db: AsyncSession, *, limit: int | None = None, offset: int = 0
) -> list[Project]:
    stmt = apply_window(
        select(Project).order_by(Project.created_at), limit=limit, offset=offset
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_projects(db: AsyncSession) -> int:
    return await count_rows(db, select(Project))


async def get_project(db: AsyncSession, project_id: uuid.UUID) -> Project | None:
    return await db.get(Project, project_id)


async def search_projects(db: AsyncSession, q: str, *, limit: int = 10) -> list[Project]:
    """Title/slug substring lookup — reliable without the search index."""
    pattern = f"%{q.strip()}%"
    stmt = (
        select(Project)
        .where(or_(Project.title.ilike(pattern), Project.slug.ilike(pattern)))
        .order_by(Project.title)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_project(db: AsyncSession, data: ProjectCreate, *, surface: str = "api") -> Project:
    obj = Project(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_project(
    db: AsyncSession, obj: Project, data: ProjectUpdate, *, surface: str = "api"
) -> Project:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_project(db: AsyncSession, obj: Project, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
