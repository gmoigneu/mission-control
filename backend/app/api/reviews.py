import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.review import ReviewCreate, ReviewOut, ReviewUpdate
from app.services import review as svc

router = APIRouter(prefix="/reviews", tags=["reviews"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ReviewOut])
async def list_reviews(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await svc.list_reviews(db)


@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def create_review(payload: ReviewCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_review(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{review_id}", response_model=ReviewOut)
async def get_review(review_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_review(db, review_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{review_id}", response_model=ReviewOut)
async def update_review(
    review_id: uuid.UUID, payload: ReviewUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_review(db, review_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_review(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(review_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_review(db, review_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_review(db, obj, surface="ui")
    await db.commit()
