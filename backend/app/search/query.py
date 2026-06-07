import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.models.company import Company
from app.models.context import Context
from app.models.person import Person
from app.models.project import Project
from app.models.task import Task
from app.search.embedder import embed_text

# subject_type -> (model, display-name attribute, has a `slug` column)
# The model slot is typed Any because columns are read dynamically below
# (model.id / getattr(model, name_attr) / model.slug).
_SUBJECT_META: dict[str, tuple[Any, str, bool]] = {
    "person": (Person, "name", True),
    "company": (Company, "name", True),
    "context": (Context, "name", True),
    "project": (Project, "title", True),
    "task": (Task, "title", False),
}


async def semantic_search(
    db: AsyncSession, query: str, types: list[str] | None = None, limit: int = 20
) -> list[dict]:
    qvec = await embed_text(query)
    distance = Chunk.embedding.cosine_distance(qvec).label("distance")
    stmt = select(
        Chunk.subject_type,
        Chunk.subject_id,
        Chunk.content,
        distance,
    )
    if types:
        stmt = stmt.where(Chunk.subject_type.in_(types))
    # Over-fetch candidate chunks so per-subject dedup below still yields up to
    # `limit` distinct subjects even when one subject has several chunks.
    stmt = stmt.order_by(distance).limit(limit * 10)
    rows = (await db.execute(stmt)).all()
    # Best (lowest distance) per subject.
    best: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = (r.subject_type, str(r.subject_id))
        score = 1.0 - float(r.distance)
        if key not in best or score > best[key]["score"]:
            best[key] = {
                "subject_type": r.subject_type,
                "subject_id": str(r.subject_id),
                "score": score,
                "snippet": r.content[:200],
            }
    ranked = sorted(best.values(), key=lambda x: x["score"], reverse=True)
    results = ranked[:limit]
    await _attach_entity_meta(db, results)
    return results


async def _attach_entity_meta(db: AsyncSession, results: list[dict]) -> None:
    """Populate each result's display `name` and `slug` from its owning entity.

    Groups subject_ids by type so we issue at most one query per entity type
    rather than one per result. Results whose entity no longer exists keep
    `name`/`slug` as None.
    """
    ids_by_type: dict[str, list[uuid.UUID]] = {}
    for r in results:
        ids_by_type.setdefault(r["subject_type"], []).append(uuid.UUID(r["subject_id"]))

    meta: dict[tuple[str, str], dict] = {}
    for stype, ids in ids_by_type.items():
        spec = _SUBJECT_META.get(stype)
        if spec is None:
            continue
        model, name_attr, has_slug = spec
        cols = [model.id, getattr(model, name_attr).label("name")]
        if has_slug:
            cols.append(model.slug.label("slug"))
        for row in (await db.execute(select(*cols).where(model.id.in_(ids)))).all():
            meta[(stype, str(row.id))] = {
                "name": row.name,
                "slug": row.slug if has_slug else None,
            }

    for r in results:
        m = meta.get((r["subject_type"], r["subject_id"]))
        r["name"] = m["name"] if m else None
        r["slug"] = m["slug"] if m else None
