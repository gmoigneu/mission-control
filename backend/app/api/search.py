from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.search import SearchResult
from app.search.query import semantic_search

router = APIRouter(prefix="/search", tags=["search"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[SearchResult])
async def search(
    q: str = Query(..., min_length=1),
    types: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> list[SearchResult]:
    parsed_types = [t.strip() for t in types.split(",") if t.strip()] if types else None
    results = await semantic_search(db, q, types=parsed_types, limit=limit)
    return [SearchResult(**r) for r in results]
