import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.journal_entry import JournalEntry
from app.schemas.journal_entry import JournalEntryCreate, JournalEntryUpdate
from app.search.index import deindex_subject, index_subject

ENTITY = "journal_entry"


async def list_journal_entries(db: AsyncSession) -> list[JournalEntry]:
    result = await db.execute(
        select(JournalEntry).order_by(JournalEntry.date.desc(), JournalEntry.created_at.desc())
    )
    return list(result.scalars().all())


async def get_journal_entry(
    db: AsyncSession, journal_entry_id: uuid.UUID
) -> JournalEntry | None:
    return await db.get(JournalEntry, journal_entry_id)


async def create_journal_entry(
    db: AsyncSession, data: JournalEntryCreate, *, surface: str = "api"
) -> JournalEntry:
    obj = JournalEntry(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_journal_entry(
    db: AsyncSession, obj: JournalEntry, data: JournalEntryUpdate, *, surface: str = "api"
) -> JournalEntry:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_journal_entry(
    db: AsyncSession, obj: JournalEntry, *, surface: str = "api"
) -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)
