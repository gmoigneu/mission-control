from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.db import get_db
from app.deps import get_current_user
from app.models.company import Company
from app.models.context import Context
from app.models.entity_link import EntityLink
from app.models.observation import Observation
from app.models.outbox import OutboxEvent
from app.models.person import Person
from app.models.project import Project
from app.models.relationship import Relationship
from app.models.task import Task
from app.models.task_link import TaskLink
from app.search.index import index_subject

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_user)])

_INDEXABLE = [
    ("context", Context),
    ("project", Project),
    ("company", Company),
    ("person", Person),
    ("task", Task),
    ("observation", Observation),
]

# Entity types that map to Neo4j nodes, in projection order
_NODE_ENTITY_TYPES = [
    ("context", Context),
    ("project", Project),
    ("company", Company),
    ("person", Person),
    ("task", Task),
]

# Edge-only entity types (no node of their own)
_EDGE_ENTITY_TYPES = [
    ("relationship", Relationship),
    ("task_link", TaskLink),
    ("entity_link", EntityLink),
]


@router.post("/reindex")
async def reindex(db: AsyncSession = Depends(get_db)):  # noqa: B008
    count = 0
    for subject_type, model in _INDEXABLE:
        rows = (await db.execute(select(model))).scalars().all()
        for obj in rows:
            await index_subject(db, subject_type, obj)
            count += 1
    await db.commit()
    return {"reindexed": count}


@router.post("/rebuild-graph")
async def rebuild_graph(db: AsyncSession = Depends(get_db)) -> dict:  # noqa: B008
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

    # Mark all pending OutboxEvents as processed
    pending = (
        await db.execute(select(OutboxEvent).where(OutboxEvent.processed_at.is_(None)))
    ).scalars().all()
    for evt in pending:
        evt.processed_at = sqla_func.now()
    await db.commit()

    return {"projected": projected}
