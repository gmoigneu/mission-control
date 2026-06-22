from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal

AdminJobKind = Literal["reindex", "rebuild_graph"]
AdminJobStatus = Literal["queued", "running", "succeeded", "failed"]
AdminJobWork = Callable[[AsyncSession], Awaitable[dict]]

_logger = logging.getLogger(__name__)


@dataclass
class AdminJob:
    id: uuid.UUID
    kind: AdminJobKind
    status: AdminJobStatus = "queued"
    result: dict | None = None
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def as_dict(self) -> dict:
        return {
            "id": str(self.id),
            "kind": self.kind,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


_JOBS: dict[uuid.UUID, AdminJob] = {}


def get_admin_job(job_id: uuid.UUID) -> AdminJob | None:
    return _JOBS.get(job_id)


def schedule_admin_job(kind: AdminJobKind, work: AdminJobWork) -> AdminJob:
    job = AdminJob(id=uuid.uuid4(), kind=kind)
    _JOBS[job.id] = job
    asyncio.create_task(_run_admin_job(job, work))
    return job


async def _run_admin_job(job: AdminJob, work: AdminJobWork) -> None:
    job.status = "running"
    job.updated_at = datetime.now(UTC)
    try:
        async with SessionLocal() as db:
            job.result = await work(db)
        job.status = "succeeded"
    except Exception as exc:
        job.status = "failed"
        job.error = str(exc)
        _logger.exception("Admin job %s (%s) failed", job.id, job.kind)
    finally:
        job.updated_at = datetime.now(UTC)
