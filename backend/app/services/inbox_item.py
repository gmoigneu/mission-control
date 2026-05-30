import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.inbox_item import InboxItem
from app.schemas.inbox_item import InboxItemCreate, InboxItemUpdate
from app.search.index import deindex_subject, index_subject

ENTITY = "inbox_item"


async def list_inbox_items(
    db: AsyncSession, status: str | None = None
) -> list[InboxItem]:
    stmt = select(InboxItem)
    if status is not None:
        stmt = stmt.where(InboxItem.status == status)
    result = await db.execute(stmt.order_by(InboxItem.created_at))
    return list(result.scalars().all())


async def get_inbox_item(db: AsyncSession, item_id: uuid.UUID) -> InboxItem | None:
    return await db.get(InboxItem, item_id)


async def create_inbox_item(
    db: AsyncSession, data: InboxItemCreate, *, surface: str = "api"
) -> InboxItem:
    obj = InboxItem(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_inbox_item(
    db: AsyncSession, obj: InboxItem, data: InboxItemUpdate, *, surface: str = "api"
) -> InboxItem:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_inbox_item(
    db: AsyncSession, obj: InboxItem, *, surface: str = "api"
) -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)
