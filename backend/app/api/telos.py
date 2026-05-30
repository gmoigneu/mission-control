import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.telos import TelosCreate, TelosOut, TelosUpdate
from app.services import telos as svc

router = APIRouter(prefix="/telos", tags=["telos"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[TelosOut])
async def list_telos(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await svc.list_telos(db)


@router.post("", response_model=TelosOut, status_code=status.HTTP_201_CREATED)
async def create_telos(payload: TelosCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_telos(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{telos_id}", response_model=TelosOut)
async def get_telos(telos_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_telos(db, telos_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{telos_id}", response_model=TelosOut)
async def update_telos(
    telos_id: uuid.UUID, payload: TelosUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_telos(db, telos_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_telos(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{telos_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_telos(telos_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_telos(db, telos_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_telos(db, obj, surface="ui")
    await db.commit()
