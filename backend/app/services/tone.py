import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.tone import Tone
from app.schemas.tone import ToneCreate, ToneUpdate
from app.search.index import deindex_subject, index_subject

ENTITY = "tone"


async def list_tones(db: AsyncSession) -> list[Tone]:
    result = await db.execute(select(Tone).order_by(Tone.created_at))
    return list(result.scalars().all())


async def get_tone(db: AsyncSession, tone_id: uuid.UUID) -> Tone | None:
    return await db.get(Tone, tone_id)


async def create_tone(db: AsyncSession, data: ToneCreate, *, surface: str = "api") -> Tone:
    obj = Tone(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_tone(
    db: AsyncSession, obj: Tone, data: ToneUpdate, *, surface: str = "api"
) -> Tone:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_tone(db: AsyncSession, obj: Tone, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)
