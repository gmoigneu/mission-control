import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.observation import ObservationCreate, ObservationOut, ObservationUpdate
from app.services import observation as svc

router = APIRouter(
    prefix="/observations", tags=["observations"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[ObservationOut])
async def list_observations(  # noqa: B008
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    return await svc.list_observations(db, subject_type=subject_type, subject_id=subject_id)


@router.post("", response_model=ObservationOut, status_code=status.HTTP_201_CREATED)
async def create_observation(
    payload: ObservationCreate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.create_observation(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{observation_id}", response_model=ObservationOut)
async def get_observation(
    observation_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_observation(db, observation_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{observation_id}", response_model=ObservationOut)
async def update_observation(
    observation_id: uuid.UUID,
    payload: ObservationUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_observation(db, observation_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_observation(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{observation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_observation(
    observation_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_observation(db, observation_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_observation(db, obj, surface="ui")
    await db.commit()
