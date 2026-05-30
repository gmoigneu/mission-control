import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.entity_link import EntityLinkCreate, EntityLinkOut
from app.services import entity_link as svc

router = APIRouter(
    prefix="/entity-links", tags=["entity-links"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[EntityLinkOut])
async def list_entity_links(  # noqa: B008
    from_type: str | None = None,
    from_id: uuid.UUID | None = None,
    to_type: str | None = None,
    to_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    return await svc.list_entity_links(
        db, from_type=from_type, from_id=from_id, to_type=to_type, to_id=to_id
    )


@router.post("", response_model=EntityLinkOut, status_code=status.HTTP_201_CREATED)
async def create_entity_link(payload: EntityLinkCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_entity_link(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{entity_link_id}", response_model=EntityLinkOut)
async def get_entity_link(entity_link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_entity_link(db, entity_link_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.delete("/{entity_link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity_link(entity_link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_entity_link(db, entity_link_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_entity_link(db, obj, surface="ui")
    await db.commit()
