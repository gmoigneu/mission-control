import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.meeting import MeetingCreate, MeetingOut, MeetingUpdate
from app.services import meeting as svc

router = APIRouter(
    prefix="/meetings", tags=["meetings"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[MeetingOut])
async def list_meetings(
    response: Response,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_meetings(db)
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_meetings(db, limit=page.limit, offset=page.offset)


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(payload: MeetingCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_meeting(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{meeting_id}", response_model=MeetingOut)
async def get_meeting(meeting_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_meeting(db, meeting_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{meeting_id}", response_model=MeetingOut)
async def update_meeting(
    meeting_id: uuid.UUID, payload: MeetingUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_meeting(db, meeting_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_meeting(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meeting(meeting_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_meeting(db, meeting_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_meeting(db, obj, surface="ui")
    await db.commit()
