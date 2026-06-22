import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.tone import ToneCreate, ToneOut, ToneUpdate
from app.services import tone as svc

router = APIRouter(prefix="/tones", tags=["tones"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ToneOut])
async def list_tones(
    response: Response,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_tones(db)
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_tones(db, limit=page.limit, offset=page.offset)


@router.post("", response_model=ToneOut, status_code=status.HTTP_201_CREATED)
async def create_tone(payload: ToneCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_tone(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{tone_id}", response_model=ToneOut)
async def get_tone(tone_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_tone(db, tone_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{tone_id}", response_model=ToneOut)
async def update_tone(
    tone_id: uuid.UUID, payload: ToneUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_tone(db, tone_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_tone(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{tone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tone(tone_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_tone(db, tone_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_tone(db, obj, surface="ui")
    await db.commit()
