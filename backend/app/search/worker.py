"""Search worker: drains unprocessed search OutboxEvents into the chunk index.

This mirrors the graph worker (app/graph/worker.py) but consumes the "search"
channel: each CRUD write fans out a search event via the transactional outbox,
and this worker embeds + (re)indexes the entity out of the request path.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outbox import CHANNEL_SEARCH, OutboxEvent

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 5.0  # seconds between polls when no events are pending


async def index_event(db: AsyncSession, aggregate_type: str, op: str, payload: dict) -> None:
    """Apply a single search outbox event to the chunk index."""
    from app.search.index import INDEXABLE_TYPES, deindex_subject, index_payload

    if aggregate_type not in INDEXABLE_TYPES:
        return
    raw_id = payload.get("id")
    if not raw_id:
        return
    subject_id = raw_id if isinstance(raw_id, uuid.UUID) else uuid.UUID(str(raw_id))

    if op == "delete":
        await deindex_subject(db, aggregate_type, subject_id)
    else:  # "upsert"
        await index_payload(db, aggregate_type, subject_id, payload)


async def process_search_outbox(db: AsyncSession, limit: int = 500) -> int:
    """Process up to *limit* unprocessed search OutboxEvents.

    Returns the number of events processed.
    """
    stmt = (
        select(OutboxEvent)
        .where(
            OutboxEvent.channel == CHANNEL_SEARCH,
            OutboxEvent.processed_at.is_(None),
        )
        .order_by(OutboxEvent.created_at)
        .limit(limit)
    )
    result = await db.execute(stmt)
    events = list(result.scalars().all())

    now = datetime.now(UTC)
    for event in events:
        await index_event(db, event.aggregate_type, event.op, event.payload or {})
        event.processed_at = now

    if events:
        await db.commit()

    return len(events)


async def run_worker() -> None:
    """Long-running loop: poll the outbox and index events for semantic search."""
    from app.db import SessionLocal

    logger.info("Search worker starting")
    while True:
        async with SessionLocal() as db:
            try:
                count = await process_search_outbox(db)
                if count:
                    logger.info("Indexed %d search outbox events", count)
            except Exception:
                logger.exception("Error in search worker iteration")
        await asyncio.sleep(_POLL_INTERVAL)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
