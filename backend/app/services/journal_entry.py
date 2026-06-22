import uuid
from datetime import UTC, datetime, timedelta
from datetime import date as date_cls
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.journal_entry import JournalEntry
from app.schemas.journal_entry import (
    DailyCheckInOut,
    DailyCheckInUpdate,
    JournalEntryCreate,
    JournalEntryUpdate,
)
from app.services.pagination import apply_window, count_rows

ENTITY = "journal_entry"


async def list_journal_entries(
    db: AsyncSession, *, limit: int | None = None, offset: int = 0
) -> list[JournalEntry]:
    stmt = apply_window(
        select(JournalEntry).order_by(JournalEntry.date.desc(), JournalEntry.created_at.desc()),
        limit=limit,
        offset=offset,
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_journal_entries(db: AsyncSession) -> int:
    return await count_rows(db, select(JournalEntry))


async def get_or_create_journal_entry(
    db: AsyncSession, entry_date: date_cls | None = None, *, surface: str = "api"
) -> JournalEntry:
    """Fetch the day's journal entry (one per date), creating an empty one if absent.

    ``date`` is not unique at the DB level, so we take the earliest entry for the
    day if several exist. Defaults to the server's current date.
    """
    day = entry_date or datetime.now(UTC).date()
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.date == day)
        .order_by(JournalEntry.created_at)
    )
    existing = result.scalars().first()
    if existing is not None:
        return existing
    return await create_journal_entry(
        db, JournalEntryCreate(date=day, body=""), surface=surface
    )


async def list_daily_checkins(
    db: AsyncSession, *, days: int = 30, end: date_cls | None = None
) -> list[DailyCheckInOut]:
    last_day = end or datetime.now(UTC).date()
    first_day = last_day - timedelta(days=days - 1)
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.date >= first_day, JournalEntry.date <= last_day)
        .order_by(JournalEntry.date, JournalEntry.created_at)
    )
    by_day: dict[date_cls, JournalEntry] = {}
    for entry in result.scalars().all():
        by_day.setdefault(entry.date, entry)

    return [
        DailyCheckInOut(
            id=entry.id if entry else None,
            date=day,
            mood=entry.mood if entry else None,
            energy=entry.energy if entry else None,
            productivity=entry.productivity if entry else None,
            updated_at=entry.updated_at if entry else None,
        )
        for day in (first_day + timedelta(days=i) for i in range(days))
        for entry in [by_day.get(day)]
    ]


async def set_daily_checkin(
    db: AsyncSession, day: date_cls, data: DailyCheckInUpdate, *, surface: str = "api"
) -> JournalEntry:
    obj = await get_or_create_journal_entry(db, day, surface=surface)
    return await update_journal_entry(
        db,
        obj,
        JournalEntryUpdate(**data.model_dump(exclude_unset=True)),
        surface=surface,
    )


async def append_journal_log(
    db: AsyncSession, obj: JournalEntry, text: str, *, surface: str = "api"
) -> JournalEntry:
    """Append a timestamped bullet to the entry body."""
    stamp = datetime.now(UTC).strftime("%H:%M")
    line = f"- {stamp} {text.strip()}"
    new_body = f"{obj.body}\n{line}" if obj.body else line
    return await update_journal_entry(
        db, obj, JournalEntryUpdate(body=new_body), surface=surface
    )


async def set_journal_summary(
    db: AsyncSession,
    obj: JournalEntry,
    *,
    title: str | None = None,
    body: str | None = None,
    surface: str = "api",
) -> JournalEntry:
    """Set the entry's title and/or replace its body with a summary."""
    fields: dict[str, Any] = {}
    if title is not None:
        fields["title"] = title
    if body is not None:
        fields["body"] = body
    return await update_journal_entry(db, obj, JournalEntryUpdate(**fields), surface=surface)


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
    return obj


async def update_journal_entry(
    db: AsyncSession, obj: JournalEntry, data: JournalEntryUpdate, *, surface: str = "api"
) -> JournalEntry:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_journal_entry(
    db: AsyncSession, obj: JournalEntry, *, surface: str = "api"
) -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
