from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.company import Company
from app.models.context import Context
from app.models.observation import Observation
from app.models.person import Person
from app.models.project import Project
from app.models.task import Task
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
