import uuid
from datetime import date as _date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.journal_entry import JournalEntry
from app.models.journal_log import JournalLog
from app.schemas.journal import JournalEntryCreate, JournalEntryUpdate, JournalLogCreate
from app.search.index import deindex_subject, index_subject

ENTITY = "journal_entry"
LOG_ENTITY = "journal_log"


async def list_journal_entries(db: AsyncSession) -> list[JournalEntry]:
    result = await db.execute(select(JournalEntry).order_by(JournalEntry.date.desc()))
    return list(result.scalars().all())


async def get_journal_entry(db: AsyncSession, entry_id: uuid.UUID) -> JournalEntry | None:
    return await db.get(JournalEntry, entry_id)


async def get_journal_entry_by_date(db: AsyncSession, day: _date) -> JournalEntry | None:
    result = await db.execute(select(JournalEntry).where(JournalEntry.date == day))
    return result.scalars().first()


async def create_journal_entry(
    db: AsyncSession, data: JournalEntryCreate, *, surface: str = "api"
) -> JournalEntry:
    existing = await get_journal_entry_by_date(db, data.date)
    if existing is not None:
        raise ValueError(f"A journal entry already exists for {data.date.isoformat()}")
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


async def list_journal_logs(db: AsyncSession, entry_id: uuid.UUID) -> list[JournalLog]:
    result = await db.execute(
        select(JournalLog)
        .where(JournalLog.journal_entry_id == entry_id)
        .order_by(JournalLog.at)
    )
    return list(result.scalars().all())


async def get_journal_log(db: AsyncSession, log_id: uuid.UUID) -> JournalLog | None:
    return await db.get(JournalLog, log_id)


async def add_journal_log(
    db: AsyncSession, entry: JournalEntry, data: JournalLogCreate, *, surface: str = "api"
) -> JournalLog:
    values = data.model_dump(exclude_unset=True)
    obj = JournalLog(journal_entry_id=entry.id, **values)
    db.add(obj)
    await db.flush()
    await record_create(db, LOG_ENTITY, obj, surface=surface)
    return obj


async def delete_journal_log(db: AsyncSession, obj: JournalLog, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, LOG_ENTITY, before, entity_id, surface=surface)
