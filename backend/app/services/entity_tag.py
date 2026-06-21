import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete
from app.models.entity_tag import EntityTag
from app.schemas.entity_tag import EntityTagCreate
from app.services.pagination import apply_window, count_rows

ENTITY = "entity_tag"


async def list_entity_tags(
    db: AsyncSession,
    tag_id: uuid.UUID | None = None,
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
    *,
    limit: int | None = None,
    offset: int = 0,
) -> list[EntityTag]:
    stmt = _entity_tags_query(
        tag_id=tag_id, subject_type=subject_type, subject_id=subject_id
    )
    stmt = apply_window(stmt.order_by(EntityTag.created_at), limit=limit, offset=offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_entity_tags(
    db: AsyncSession,
    tag_id: uuid.UUID | None = None,
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
) -> int:
    return await count_rows(
        db, _entity_tags_query(tag_id=tag_id, subject_type=subject_type, subject_id=subject_id)
    )


def _entity_tags_query(
    *,
    tag_id: uuid.UUID | None = None,
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
):
    stmt = select(EntityTag)
    if tag_id is not None:
        stmt = stmt.where(EntityTag.tag_id == tag_id)
    if subject_type is not None:
        stmt = stmt.where(EntityTag.subject_type == subject_type)
    if subject_id is not None:
        stmt = stmt.where(EntityTag.subject_id == subject_id)
    return stmt


async def get_entity_tag(db: AsyncSession, entity_tag_id: uuid.UUID) -> EntityTag | None:
    return await db.get(EntityTag, entity_tag_id)


async def create_entity_tag(
    db: AsyncSession, data: EntityTagCreate, *, surface: str = "api"
) -> EntityTag:
    obj = EntityTag(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def delete_entity_tag(db: AsyncSession, obj: EntityTag, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
