import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.entity_tag import EntityTagCreate, EntityTagOut
from app.services import entity_tag as svc

router = APIRouter(
    prefix="/entity-tags", tags=["entity-tags"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[EntityTagOut])
async def list_entity_tags(  # noqa: B008
    response: Response,
    tag_id: uuid.UUID | None = None,
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_entity_tags(
        db, tag_id=tag_id, subject_type=subject_type, subject_id=subject_id
    )
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_entity_tags(
        db,
        tag_id=tag_id,
        subject_type=subject_type,
        subject_id=subject_id,
        limit=page.limit,
        offset=page.offset,
    )


@router.post("", response_model=EntityTagOut, status_code=status.HTTP_201_CREATED)
async def create_entity_tag(payload: EntityTagCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_entity_tag(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{entity_tag_id}", response_model=EntityTagOut)
async def get_entity_tag(entity_tag_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_entity_tag(db, entity_tag_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.delete("/{entity_tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity_tag(entity_tag_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_entity_tag(db, entity_tag_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_entity_tag(db, obj, surface="ui")
    await db.commit()
