"""Graph query API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.deps import get_current_user
from app.graph import query as gq
from app.graph.client import Runner, neo4j_runner

router = APIRouter(prefix="/graph", tags=["graph"], dependencies=[Depends(get_current_user)])

_INTENTS = {"who_at_company", "connection_path", "neighbors"}


def get_runner() -> Runner:
    """Injectable Neo4j runner (overridden in tests)."""
    return neo4j_runner


class GraphQuery(BaseModel):
    intent: str
    params: dict = {}


@router.post("/query")
async def graph_query(body: GraphQuery, run: Runner = Depends(get_runner)) -> list[dict]:  # noqa: B008
    if body.intent not in _INTENTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown intent '{body.intent}'. Valid: {sorted(_INTENTS)}",
        )

    p = body.params
    if body.intent == "who_at_company":
        company_slug = p.get("company_slug") or p.get("slug", "")
        return await gq.who_at_company(run, company_slug)

    if body.intent == "connection_path":
        return await gq.connection_path(run, p.get("from_id", ""), p.get("to_id", ""))

    # neighbors
    return await gq.neighbors(run, p.get("person_id", ""))


@router.get("/full")
async def graph_full(
    context: str | None = None,
    limit: int = Query(default=5000, ge=1, le=50_000),
    run: Runner = Depends(get_runner),  # noqa: B008
) -> dict:
    return await gq.full_graph(run, context=context, limit=limit)


@router.get("/node/{node_id}")
async def graph_node(node_id: str, run: Runner = Depends(get_runner)) -> dict:  # noqa: B008
    detail = await gq.node_detail(run, node_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return detail


@router.get("/neighborhood/{node_id}")
async def graph_neighborhood(
    node_id: str,
    depth: int = Query(default=2, ge=1, le=2),
    limit: int = Query(default=80, ge=1, le=500),
    run: Runner = Depends(get_runner),  # noqa: B008
) -> dict:
    snapshot = await gq.neighborhood(run, node_id, depth=depth, limit=limit)
    if not snapshot["nodes"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return snapshot
