import uuid
from collections import defaultdict
from typing import Any, NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete
from app.models.company import Company
from app.models.context import Context
from app.models.entity_link import EntityLink
from app.models.habit import Habit
from app.models.inbox_item import InboxItem
from app.models.journal_entry import JournalEntry
from app.models.knowledge import Knowledge
from app.models.meeting import Meeting
from app.models.person import Person
from app.models.project import Project
from app.models.review import Review
from app.models.task import Task
from app.models.telos import Telos
from app.models.tone import Tone
from app.schemas.entity_link import EntityLinkCreate

ENTITY = "entity_link"


class EntityMetaConfig(NamedTuple):
    model: type[Any]
    name_attr: InstrumentedAttribute[Any]
    slug_attr: InstrumentedAttribute[Any] | None = None


ENTITY_META: dict[str, EntityMetaConfig] = {
    "company": EntityMetaConfig(Company, Company.name, Company.slug),
    "context": EntityMetaConfig(Context, Context.name, Context.slug),
    "habit": EntityMetaConfig(Habit, Habit.name, Habit.slug),
    "inbox_item": EntityMetaConfig(InboxItem, InboxItem.body),
    "journal_entry": EntityMetaConfig(JournalEntry, JournalEntry.title),
    "knowledge": EntityMetaConfig(Knowledge, Knowledge.title, Knowledge.slug),
    "meeting": EntityMetaConfig(Meeting, Meeting.title, Meeting.slug),
    "person": EntityMetaConfig(Person, Person.name, Person.slug),
    "project": EntityMetaConfig(Project, Project.title, Project.slug),
    "review": EntityMetaConfig(Review, Review.title),
    "task": EntityMetaConfig(Task, Task.title),
    "telos": EntityMetaConfig(Telos, Telos.title),
    "tone": EntityMetaConfig(Tone, Tone.name, Tone.slug),
}


def _derived_name(entity_type: str, entity_id: uuid.UUID) -> str:
    return f"{entity_type.replace('_', ' ')} {str(entity_id)[:8]}"


async def _entity_meta(
    db: AsyncSession, refs: set[tuple[str, uuid.UUID]]
) -> dict[tuple[str, uuid.UUID], tuple[str | None, str | None]]:
    refs_by_type: dict[str, set[uuid.UUID]] = defaultdict(set)
    for entity_type, entity_id in refs:
        refs_by_type[entity_type].add(entity_id)

    meta: dict[tuple[str, uuid.UUID], tuple[str | None, str | None]] = {}
    for entity_type, ids in refs_by_type.items():
        config = ENTITY_META.get(entity_type)
        if config is None:
            continue

        selected = [config.model.id, config.name_attr]
        if config.slug_attr is not None:
            selected.append(config.slug_attr)

        result = await db.execute(select(*selected).where(config.model.id.in_(ids)))
        for row in result.all():
            if config.slug_attr is None:
                entity_id, name = row
                slug = None
            else:
                entity_id, name, slug = row
            meta[(entity_type, entity_id)] = (name, slug)
    return meta


def _entity_link_out(
    obj: EntityLink,
    meta: dict[tuple[str, uuid.UUID], tuple[str | None, str | None]],
) -> dict[str, Any]:
    from_name, from_slug = meta.get((obj.from_type, obj.from_id), (None, None))
    to_name, to_slug = meta.get((obj.to_type, obj.to_id), (None, None))
    return {
        **model_to_dict(obj),
        "from_name": from_name or _derived_name(obj.from_type, obj.from_id),
        "from_slug": from_slug,
        "to_name": to_name or _derived_name(obj.to_type, obj.to_id),
        "to_slug": to_slug,
    }


def _matches_query(row: dict[str, Any], q: str | None) -> bool:
    terms = q.strip().lower().split() if q else []
    if not terms:
        return True

    haystack = " ".join(
        str(value).lower()
        for value in [
            row["from_type"],
            row["from_name"],
            row["from_slug"],
            row["to_type"],
            row["to_name"],
            row["to_slug"],
            row["kind"],
        ]
        if value
    )
    return all(term in haystack for term in terms)


async def list_entity_links(
    db: AsyncSession,
    from_type: str | None = None,
    from_id: uuid.UUID | None = None,
    to_type: str | None = None,
    to_id: uuid.UUID | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    stmt = select(EntityLink)
    if from_type is not None:
        stmt = stmt.where(EntityLink.from_type == from_type)
    if from_id is not None:
        stmt = stmt.where(EntityLink.from_id == from_id)
    if to_type is not None:
        stmt = stmt.where(EntityLink.to_type == to_type)
    if to_id is not None:
        stmt = stmt.where(EntityLink.to_id == to_id)
    result = await db.execute(stmt.order_by(EntityLink.created_at))
    links = list(result.scalars().all())
    refs = {(link.from_type, link.from_id) for link in links} | {
        (link.to_type, link.to_id) for link in links
    }
    meta = await _entity_meta(db, refs)
    rows = [_entity_link_out(link, meta) for link in links]
    return [row for row in rows if _matches_query(row, q)]


async def get_entity_link(db: AsyncSession, entity_link_id: uuid.UUID) -> EntityLink | None:
    return await db.get(EntityLink, entity_link_id)


async def get_entity_link_out(
    db: AsyncSession, entity_link_id: uuid.UUID
) -> dict[str, Any] | None:
    obj = await get_entity_link(db, entity_link_id)
    if obj is None:
        return None
    meta = await _entity_meta(db, {(obj.from_type, obj.from_id), (obj.to_type, obj.to_id)})
    return _entity_link_out(obj, meta)


async def create_entity_link(
    db: AsyncSession, data: EntityLinkCreate, *, surface: str = "api"
) -> EntityLink:
    obj = EntityLink(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def delete_entity_link(db: AsyncSession, obj: EntityLink, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
