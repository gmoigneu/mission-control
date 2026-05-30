import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.habit import Habit
from app.schemas.habit import (
    HabitCreate,
    HabitLogCreate,
    HabitLogOut,
    HabitOut,
    HabitUpdate,
)
from app.services import habit as svc

router = APIRouter(prefix="/habits", tags=["habits"], dependencies=[Depends(get_current_user)])


async def _to_out(db: AsyncSession, habit: Habit) -> HabitOut:
    streak, logged_today = await svc.habit_stats(db, habit.id)
    out = HabitOut.model_validate(habit)
    out.streak = streak
    out.logged_today = logged_today
    return out


@router.get("", response_model=list[HabitOut])
async def list_habits(  # noqa: B008
    active: bool | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    habits = await svc.list_habits(db, active=active)
    return [await _to_out(db, h) for h in habits]


@router.post("", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
async def create_habit(payload: HabitCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_habit(db, payload, surface="ui")
    await db.commit()
    return await _to_out(db, obj)


@router.get("/{habit_id}", response_model=HabitOut)
async def get_habit(habit_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_habit(db, habit_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await _to_out(db, obj)


@router.patch("/{habit_id}", response_model=HabitOut)
async def update_habit(
    habit_id: uuid.UUID, payload: HabitUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_habit(db, habit_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_habit(db, obj, payload, surface="ui")
    await db.commit()
    return await _to_out(db, obj)


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_habit(habit_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_habit(db, habit_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_habit(db, obj, surface="ui")
    await db.commit()


@router.get("/{habit_id}/logs", response_model=list[HabitLogOut])
async def list_habit_logs(habit_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_habit(db, habit_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await svc.list_logs(db, habit_id)


@router.post(
    "/{habit_id}/logs", response_model=HabitLogOut, status_code=status.HTTP_201_CREATED
)
async def log_habit(
    habit_id: uuid.UUID, payload: HabitLogCreate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_habit(db, habit_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    log = await svc.upsert_log(db, obj, payload, surface="ui")
    await db.commit()
    return log
