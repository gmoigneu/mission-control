import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.audit.serialize import model_to_dict
from app.db import get_db
from app.deps import get_current_user
from app.models.company import Company
from app.models.context import Context
from app.models.entity_link import EntityLink
from app.models.meeting import Meeting
from app.models.outbox import CHANNEL_GRAPH, OutboxEvent
from app.models.person import Person
from app.models.project import Project
from app.models.relationship import Relationship
from app.models.task import Task
from app.models.task_link import TaskLink
from app.search.index import index_subject
from app.search.registry import iter_searchable_specs
from app.services.admin_jobs import get_admin_job, schedule_admin_job

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_user)])

# Entity types that map to Neo4j nodes, in projection order
_NODE_ENTITY_TYPES = [
    ("context", Context),
    ("project", Project),
    ("company", Company),
    ("person", Person),
    ("task", Task),
    ("meeting", Meeting),
]

# Edge-only entity types (no node of their own)
_EDGE_ENTITY_TYPES = [
    ("relationship", Relationship),
    ("task_link", TaskLink),
    ("entity_link", EntityLink),
]


@router.post("/reindex")
async def reindex(
    wait: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    if wait:
        return await reindex_all(db)
    job = schedule_admin_job("reindex", reindex_all)
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=job.as_dict())


async def reindex_all(db: AsyncSession) -> dict:
    count = 0
    for spec in iter_searchable_specs():
        rows = (await db.execute(select(spec.model))).scalars().all()
        for obj in rows:
            await index_subject(db, spec.subject_type, obj)
            count += 1
    await db.commit()
    return {"reindexed": count}


@router.post("/rebuild-graph")
async def rebuild_graph(
    wait: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    if wait:
        return await rebuild_graph_projection(db)
    job = schedule_admin_job("rebuild_graph", rebuild_graph_projection)
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=job.as_dict())


async def rebuild_graph_projection(db: AsyncSession) -> dict:
    """Wipe the Neo4j graph and re-project every entity from Postgres."""
    from sqlalchemy import func as sqla_func

    from app.graph.client import neo4j_runner
    from app.graph.projector import project_event

    # Clear all Neo4j data
    await neo4j_runner("MATCH (n) DETACH DELETE n", {})

    projected = 0

    # Project node entities first
    for entity_type, model_cls in _NODE_ENTITY_TYPES:
        rows = (await db.execute(select(model_cls))).scalars().all()
        for obj in rows:
            await project_event(neo4j_runner, entity_type, "upsert", model_to_dict(obj))
            projected += 1

    # Project edge entities
    for entity_type, model_cls in _EDGE_ENTITY_TYPES:
        rows = (await db.execute(select(model_cls))).scalars().all()
        for obj in rows:
            await project_event(neo4j_runner, entity_type, "upsert", model_to_dict(obj))
            projected += 1

    # Mark pending graph events as processed. Other channels (for example
    # search indexing) must remain pending for their own workers.
    pending = (
        await db.execute(
            select(OutboxEvent).where(
                OutboxEvent.channel == CHANNEL_GRAPH,
                OutboxEvent.processed_at.is_(None),
            )
        )
    ).scalars().all()
    for evt in pending:
        evt.processed_at = sqla_func.now()
    await db.commit()

    return {"projected": projected}


@router.get("/jobs/{job_id}")
async def get_job(job_id: uuid.UUID) -> dict:
    job = get_admin_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job.as_dict()
