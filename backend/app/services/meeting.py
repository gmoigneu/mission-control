import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.meeting import Meeting
from app.schemas.meeting import MeetingCreate, MeetingUpdate
from app.search.index import deindex_subject, index_subject

ENTITY = "meeting"


async def list_meetings(db: AsyncSession) -> list[Meeting]:
    result = await db.execute(select(Meeting).order_by(Meeting.at))
    return list(result.scalars().all())


async def get_meeting(db: AsyncSession, meeting_id: uuid.UUID) -> Meeting | None:
    return await db.get(Meeting, meeting_id)


async def create_meeting(db: AsyncSession, data: MeetingCreate, *, surface: str = "api") -> Meeting:
    obj = Meeting(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_meeting(
    db: AsyncSession, obj: Meeting, data: MeetingUpdate, *, surface: str = "api"
) -> Meeting:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_meeting(db: AsyncSession, obj: Meeting, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)
