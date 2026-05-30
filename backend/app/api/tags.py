import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.tag import TagCreate, TagOut, TagUpdate
from app.services import tag as svc

router = APIRouter(prefix="/tags", tags=["tags"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[TagOut])
async def list_tags(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await svc.list_tags(db)


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(payload: TagCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_tag(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{tag_id}", response_model=TagOut)
async def get_tag(tag_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_tag(db, tag_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{tag_id}", response_model=TagOut)
async def update_tag(
    tag_id: uuid.UUID, payload: TagUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_tag(db, tag_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_tag(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_tag(db, tag_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_tag(db, obj, surface="ui")
    await db.commit()
