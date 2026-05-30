"""Graph query API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import get_current_user
from app.graph import query as gq
from app.graph.client import neo4j_runner

router = APIRouter(prefix="/graph", tags=["graph"], dependencies=[Depends(get_current_user)])

_INTENTS = {"who_at_company", "connection_path", "neighbors"}


class GraphQuery(BaseModel):
    intent: str
    params: dict = {}


@router.post("/query")
async def graph_query(body: GraphQuery) -> list[dict]:
    if body.intent not in _INTENTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown intent '{body.intent}'. Valid: {sorted(_INTENTS)}",
        )

    p = body.params
    if body.intent == "who_at_company":
        company_slug = p.get("company_slug") or p.get("slug", "")
        return await gq.who_at_company(neo4j_runner, company_slug)

    if body.intent == "connection_path":
        return await gq.connection_path(neo4j_runner, p.get("from_id", ""), p.get("to_id", ""))

    # neighbors
    return await gq.neighbors(neo4j_runner, p.get("person_id", ""))
