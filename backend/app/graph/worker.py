"""Outbox worker: drains unprocessed OutboxEvents into Neo4j."""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.client import Runner
from app.models.outbox import OutboxEvent

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 5.0  # seconds between polls when no events are pending


async def process_outbox(db: AsyncSession, run: Runner, limit: int = 500) -> int:
    """Process up to *limit* unprocessed OutboxEvents.

    Returns the number of events processed.
    """
    from app.graph.projector import project_event

    stmt = (
        select(OutboxEvent)
        .where(OutboxEvent.processed_at.is_(None))
        .order_by(OutboxEvent.created_at)
        .limit(limit)
    )
    result = await db.execute(stmt)
    events = list(result.scalars().all())

    now = datetime.now(UTC)
    for event in events:
        await project_event(run, event.aggregate_type, event.op, event.payload or {})
        event.processed_at = now

    if events:
        await db.commit()

    return len(events)


async def run_worker() -> None:
    """Long-running loop: poll the outbox and project events into Neo4j."""
    from app.db import SessionLocal
    from app.graph.client import close_driver, neo4j_runner

    logger.info("Graph worker starting")
    try:
        while True:
            async with SessionLocal() as db:
                try:
                    count = await process_outbox(db, neo4j_runner)
                    if count:
                        logger.info("Projected %d outbox events", count)
                except Exception:
                    logger.exception("Error in graph worker iteration")
            await asyncio.sleep(_POLL_INTERVAL)
    finally:
        await close_driver()
        logger.info("Graph worker stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
