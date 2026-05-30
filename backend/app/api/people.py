import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.person import PersonCreate, PersonOut, PersonUpdate
from app.services import person as svc

router = APIRouter(prefix="/people", tags=["people"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[PersonOut])
async def list_people(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await svc.list_people(db)


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(payload: PersonCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_person(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{person_id}", response_model=PersonOut)
async def get_person(person_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_person(db, person_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{person_id}", response_model=PersonOut)
async def update_person(
    person_id: uuid.UUID, payload: PersonUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_person(db, person_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_person(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(person_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_person(db, person_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_person(db, obj, surface="ui")
    await db.commit()
