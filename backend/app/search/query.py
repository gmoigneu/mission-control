import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.search.embedder import embed_text
from app.search.registry import SEARCHABLE_SPECS


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
        spec = SEARCHABLE_SPECS.get(stype)
        if spec is None:
            continue
        model = spec.model
        cols = [model.id, getattr(model, spec.display_attr).label("name")]
        if spec.slug_attr:
            cols.append(getattr(model, spec.slug_attr).label("slug"))
        for row in (await db.execute(select(*cols).where(model.id.in_(ids)))).all():
            meta[(stype, str(row.id))] = {
                "name": row.name,
                "slug": row.slug if spec.slug_attr else None,
            }

    for r in results:
        m = meta.get((r["subject_type"], r["subject_id"]))
        r["name"] = m["name"] if m else None
        r["slug"] = m["slug"] if m else None
