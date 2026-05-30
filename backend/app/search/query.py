from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.search.embedder import embed_text


async def semantic_search(
    db: AsyncSession, query: str, types: list[str] | None = None, limit: int = 20
) -> list[dict]:
    qvec = await embed_text(query)
    stmt = select(
        Chunk.subject_type,
        Chunk.subject_id,
        Chunk.content,
        Chunk.embedding.cosine_distance(qvec).label("distance"),
    )
    if types:
        stmt = stmt.where(Chunk.subject_type.in_(types))
    stmt = stmt.order_by("distance").limit(limit)
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
    return sorted(best.values(), key=lambda x: x["score"], reverse=True)
