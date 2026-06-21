import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.knowledge import Knowledge
from app.schemas.knowledge import KnowledgeCreate, KnowledgeUpdate

ENTITY = "knowledge"


async def list_knowledge(db: AsyncSession) -> list[Knowledge]:
    result = await db.execute(select(Knowledge).order_by(Knowledge.created_at))
    return list(result.scalars().all())


async def get_knowledge(db: AsyncSession, knowledge_id: uuid.UUID) -> Knowledge | None:
    return await db.get(Knowledge, knowledge_id)


async def create_knowledge(
    db: AsyncSession, data: KnowledgeCreate, *, surface: str = "api"
) -> Knowledge:
    obj = Knowledge(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_knowledge(
    db: AsyncSession, obj: Knowledge, data: KnowledgeUpdate, *, surface: str = "api"
) -> Knowledge:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_knowledge(db: AsyncSession, obj: Knowledge, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
