import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.habit import Habit, HabitLog
from app.schemas.habit import HabitCreate, HabitLogCreate, HabitUpdate
from app.search.index import deindex_subject, index_subject

ENTITY = "habit"
LOG_ENTITY = "habit_log"


async def list_habits(db: AsyncSession, *, active: bool | None = None) -> list[Habit]:
    stmt = select(Habit)
    if active is not None:
        stmt = stmt.where(Habit.active == active)
    result = await db.execute(stmt.order_by(Habit.created_at))
    return list(result.scalars().all())


async def get_habit(db: AsyncSession, habit_id: uuid.UUID) -> Habit | None:
    return await db.get(Habit, habit_id)


async def create_habit(db: AsyncSession, data: HabitCreate, *, surface: str = "api") -> Habit:
    obj = Habit(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def update_habit(
    db: AsyncSession, obj: Habit, data: HabitUpdate, *, surface: str = "api"
) -> Habit:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    await index_subject(db, ENTITY, obj)
    return obj


async def delete_habit(db: AsyncSession, obj: Habit, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
    await deindex_subject(db, ENTITY, entity_id)


async def list_logs(db: AsyncSession, habit_id: uuid.UUID) -> list[HabitLog]:
    result = await db.execute(
        select(HabitLog).where(HabitLog.habit_id == habit_id).order_by(HabitLog.date)
    )
    return list(result.scalars().all())


async def list_logs_range(
    db: AsyncSession,
    *,
    start: date,
    end: date,
    active: bool | None = True,
) -> list[HabitLog]:
    stmt = (
        select(HabitLog)
        .join(Habit, Habit.id == HabitLog.habit_id)
        .where(HabitLog.date >= start, HabitLog.date <= end)
        .order_by(HabitLog.date, HabitLog.created_at)
    )
    if active is not None:
        stmt = stmt.where(Habit.active == active)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def upsert_log(
    db: AsyncSession, habit: Habit, data: HabitLogCreate, *, surface: str = "api"
) -> HabitLog:
    """Record a daily check-in, audited. Re-logging the same day updates the row."""
    score = data.score
    done = data.done
    if habit.tracking_type == "score":
        if score is None:
            raise ValueError("Score habits require a score")
        done = score > 0
    else:
        score = None
    existing = (
        await db.execute(
            select(HabitLog).where(
                HabitLog.habit_id == habit.id, HabitLog.date == data.date
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        before = model_to_dict(existing)
        existing.done = done
        existing.score = score
        await db.flush()
        await record_update(db, LOG_ENTITY, existing, before, surface=surface)
        return existing
    obj = HabitLog(habit_id=habit.id, date=data.date, done=done, score=score)
    db.add(obj)
    await db.flush()
    await record_create(db, LOG_ENTITY, obj, surface=surface)
    return obj


def compute_streak(
    logs: list[HabitLog], *, today: date | None = None, tracking_type: str = "boolean"
) -> int:
    """Count consecutive days (ending today or yesterday) with a `done` log."""
    today = today or date.today()
    if tracking_type == "score":
        done_days = {log.date for log in logs if log.score is not None}
    else:
        done_days = {log.date for log in logs if log.done}
    if not done_days:
        return 0
    # Allow the streak to be "alive" if today isn't logged yet but yesterday is.
    if today in done_days:
        cursor = today
    elif (today - timedelta(days=1)) in done_days:
        cursor = today - timedelta(days=1)
    else:
        return 0
    streak = 0
    while cursor in done_days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


async def habit_stats(
    db: AsyncSession, habit_id: uuid.UUID, *, today: date | None = None
) -> tuple[int, bool]:
    """Return (current streak, whether today is logged done) for a habit."""
    today = today or date.today()
    logs = await list_logs(db, habit_id)
    habit = await get_habit(db, habit_id)
    tracking_type = habit.tracking_type if habit is not None else "boolean"
    streak = compute_streak(logs, today=today, tracking_type=tracking_type)
    logged_today = any(
        log.date == today and (log.score is not None if tracking_type == "score" else log.done)
        for log in logs
    )
    return streak, logged_today
