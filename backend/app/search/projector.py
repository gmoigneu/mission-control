import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.context import Context
from app.models.outbox import OutboxEvent
from app.models.person import Person
from app.models.task import Task
from app.search.index import deindex_subject, index_subject

_logger = logging.getLogger(__name__)


async def project_index_event(db: AsyncSession, event: OutboxEvent) -> None:
    """Apply a single search-index outbox event to the chunk store."""
    subject_type = (event.payload or {}).get("subject_type")
    if not subject_type:
        _logger.warning("Index event %s missing subject_type, skipping", event.id)
        return
    if event.op == "delete":
        await deindex_subject(db, subject_type, event.aggregate_id)
        return
    obj = await _load_entity(db, subject_type, event.aggregate_id)
    if obj is None:
        # Entity was removed before draining; ensure stale chunks are gone.
        await deindex_subject(db, subject_type, event.aggregate_id)
        return
    await index_subject(db, subject_type, obj)


async def _load_entity(db: AsyncSession, subject_type: str, subject_id: uuid.UUID) -> Any:
    if subject_type == "context":
        return await db.get(Context, subject_id)
    if subject_type == "task":
        return await db.get(Task, subject_id)
    if subject_type == "person":
        return await db.get(Person, subject_id)
    return None
