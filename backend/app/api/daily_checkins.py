from datetime import date as date_cls
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.journal_entry import DailyCheckInOut, DailyCheckInUpdate
from app.services import journal_entry as svc

router = APIRouter(
    prefix="/daily-checkins",
    tags=["daily-checkins"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[DailyCheckInOut])
async def list_daily_checkins(
    days: int = Query(default=30, ge=1, le=365),
    end: date_cls | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    return await svc.list_daily_checkins(db, days=days, end=end)


@router.put("/{entry_date}", response_model=DailyCheckInOut)
async def set_daily_checkin(
    entry_date: date_cls,
    payload: DailyCheckInUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.set_daily_checkin(db, entry_date, payload, surface="ui")
    await db.commit()
    return DailyCheckInOut(
        id=obj.id,
        date=obj.date,
        mood=obj.mood,
        energy=obj.energy,
        productivity=obj.productivity,
        updated_at=obj.updated_at or datetime.now().astimezone(),
    )
