import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.inbox_item import InboxItemCreate, InboxItemOut, InboxItemUpdate
from app.services import inbox_item as svc

router = APIRouter(
    prefix="/inbox", tags=["inbox"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[InboxItemOut])
async def list_inbox_items(  # noqa: B008
    status: str | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    return await svc.list_inbox_items(db, status=status)


@router.post("", response_model=InboxItemOut, status_code=status.HTTP_201_CREATED)
async def create_inbox_item(
    payload: InboxItemCreate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.create_inbox_item(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{item_id}", response_model=InboxItemOut)
async def get_inbox_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_inbox_item(db, item_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{item_id}", response_model=InboxItemOut)
async def update_inbox_item(
    item_id: uuid.UUID, payload: InboxItemUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_inbox_item(db, item_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_inbox_item(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inbox_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_inbox_item(db, item_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_inbox_item(db, obj, surface="ui")
    await db.commit()
