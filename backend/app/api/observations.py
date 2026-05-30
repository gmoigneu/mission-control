import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.observation import ObservationCreate, ObservationOut, ObservationUpdate
from app.services import observation as svc

router = APIRouter(
    prefix="/observations", tags=["observations"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[ObservationOut])
async def list_observations(  # noqa: B008
    response: Response,
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_observations(
        db, subject_type=subject_type, subject_id=subject_id
    )
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_observations(
        db,
        subject_type=subject_type,
        subject_id=subject_id,
        limit=page.limit,
        offset=page.offset,
    )


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
