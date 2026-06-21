import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.relationship import RelationshipCreate, RelationshipOut, RelationshipUpdate
from app.services import relationship as svc

router = APIRouter(
    prefix="/relationships", tags=["relationships"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[RelationshipOut])
async def list_relationships(
    response: Response,
    q: str | None = Query(default=None, min_length=1),
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_relationships(db, q=q)
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_relationships(db, limit=page.limit, offset=page.offset, q=q)


@router.post("", response_model=RelationshipOut, status_code=status.HTTP_201_CREATED)
async def create_relationship(
    payload: RelationshipCreate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.create_relationship(db, payload, surface="ui")
    out = await svc.get_relationship_out(db, obj.id)
    await db.commit()
    return out


@router.get("/{relationship_id}", response_model=RelationshipOut)
async def get_relationship(
    relationship_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    out = await svc.get_relationship_out(db, relationship_id)
    if out is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return out


@router.patch("/{relationship_id}", response_model=RelationshipOut)
async def update_relationship(
    relationship_id: uuid.UUID,
    payload: RelationshipUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_relationship(db, relationship_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_relationship(db, obj, payload, surface="ui")
    out = await svc.get_relationship_out(db, obj.id)
    await db.commit()
    return out


@router.delete("/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relationship(
    relationship_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_relationship(db, relationship_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_relationship(db, obj, surface="ui")
    await db.commit()
