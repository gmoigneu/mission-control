import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.entity_link import EntityLinkCreate, EntityLinkOut
from app.services import entity_link as svc

router = APIRouter(
    prefix="/entity-links", tags=["entity-links"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[EntityLinkOut])
async def list_entity_links(  # noqa: B008
    response: Response,
    from_type: str | None = None,
    from_id: uuid.UUID | None = None,
    to_type: str | None = None,
    to_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, min_length=1),
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_entity_links(
        db, from_type=from_type, from_id=from_id, to_type=to_type, to_id=to_id, q=q
    )
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_entity_links(
        db,
        from_type=from_type,
        from_id=from_id,
        to_type=to_type,
        to_id=to_id,
        q=q,
        limit=page.limit,
        offset=page.offset,
    )


@router.post("", response_model=EntityLinkOut, status_code=status.HTTP_201_CREATED)
async def create_entity_link(payload: EntityLinkCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_entity_link(db, payload, surface="ui")
    out = await svc.get_entity_link_out(db, obj.id)
    await db.commit()
    return out


@router.get("/{entity_link_id}", response_model=EntityLinkOut)
async def get_entity_link(entity_link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    out = await svc.get_entity_link_out(db, entity_link_id)
    if out is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return out


@router.delete("/{entity_link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity_link(entity_link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_entity_link(db, entity_link_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_entity_link(db, obj, surface="ui")
    await db.commit()
