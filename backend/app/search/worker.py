import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_factory
from app.models.outbox import OutboxEvent, OutboxStatus
from app.search.index import INDEX_AGGREGATE
from app.search.projector import project_index_event

_logger = logging.getLogger(__name__)

INDEX_AGGREGATES = {INDEX_AGGREGATE}

POLL_INTERVAL_SECONDS = 2.0
BATCH_SIZE = 50


async def drain_once(db: AsyncSession) -> int:
    """Process a batch of pending index outbox events. Returns number processed."""
    result = await db.execute(
        select(OutboxEvent)
        .where(OutboxEvent.status == OutboxStatus.pending)
        .where(OutboxEvent.aggregate_type.in_(INDEX_AGGREGATES))
        .order_by(OutboxEvent.created_at)
        .limit(BATCH_SIZE)
        .with_for_update(skip_locked=True)
    )
    events = list(result.scalars().all())
    if not events:
        return 0
    for event in events:
        await _process_event(db, event)
    await db.commit()
    return len(events)


async def _process_event(db: AsyncSession, event: OutboxEvent) -> None:
    try:
        await project_index_event(db, event)
        event.status = OutboxStatus.done
        from datetime import UTC, datetime
        event.processed_at = datetime.now(UTC)
    except Exception as exc:  # noqa: BLE001
        event.status = OutboxStatus.failed
        event.attempts += 1
        event.last_error = str(exc)
        _logger.exception("Failed to index event %s", event.id)


async def run_worker() -> None:
    """Long-running worker loop draining the index outbox."""
    while True:
        await db_drain()
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def db_drain() -> int:
    async with async_session_factory() as session:
        async with session.begin():
            return await drain_once(session)
