import uuid
from collections.abc import Sequence
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.habit import Habit, HabitLog
from app.schemas.habit import HabitCreate, HabitLogCreate, HabitUpdate
from app.services.pagination import apply_window, count_rows

ENTITY = "habit"
LOG_ENTITY = "habit_log"


async def list_habits(
    db: AsyncSession,
    *,
    active: bool | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[Habit]:
    stmt = select(Habit)
    if active is not None:
        stmt = stmt.where(Habit.active == active)
    stmt = apply_window(stmt.order_by(Habit.created_at), limit=limit, offset=offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_habits(db: AsyncSession, *, active: bool | None = None) -> int:
    stmt = select(Habit)
    if active is not None:
        stmt = stmt.where(Habit.active == active)
    return await count_rows(db, stmt)


async def get_habit(db: AsyncSession, habit_id: uuid.UUID) -> Habit | None:
    return await db.get(Habit, habit_id)


async def create_habit(db: AsyncSession, data: HabitCreate, *, surface: str = "api") -> Habit:
    obj = Habit(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_habit(
    db: AsyncSession, obj: Habit, data: HabitUpdate, *, surface: str = "api"
) -> Habit:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_habit(db: AsyncSession, obj: Habit, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)


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
) -> tuple[int, bool, int | None]:
    """Return (streak, whether today is logged, today's score) for a habit."""
    today = today or date.today()
    logs = await list_logs(db, habit_id)
    habit = await get_habit(db, habit_id)
    tracking_type = habit.tracking_type if habit is not None else "boolean"
    streak = compute_streak(logs, today=today, tracking_type=tracking_type)
    today_log = next((log for log in logs if log.date == today), None)
    logged_today = bool(
        today_log and (today_log.score is not None if tracking_type == "score" else today_log.done)
    )
    today_score = today_log.score if today_log and tracking_type == "score" else None
    return streak, logged_today, today_score


async def habit_stats_by_id(
    db: AsyncSession, habits: Sequence[Habit], *, today: date | None = None
) -> dict[uuid.UUID, tuple[int, bool, int | None]]:
    """Return stats for a batch of habits without per-habit log queries."""
    if not habits:
        return {}

    today = today or date.today()
    habit_by_id = {habit.id: habit for habit in habits}
    logs_by_habit: dict[uuid.UUID, list[HabitLog]] = {habit.id: [] for habit in habits}
    result = await db.execute(
        select(HabitLog)
        .where(HabitLog.habit_id.in_(habit_by_id))
        .order_by(HabitLog.habit_id, HabitLog.date)
    )
    for log in result.scalars().all():
        logs_by_habit[log.habit_id].append(log)

    stats: dict[uuid.UUID, tuple[int, bool, int | None]] = {}
    for habit_id, habit in habit_by_id.items():
        logs = logs_by_habit[habit_id]
        tracking_type = habit.tracking_type
        streak = compute_streak(logs, today=today, tracking_type=tracking_type)
        today_log = next((log for log in logs if log.date == today), None)
        logged_today = bool(
            today_log
            and (today_log.score is not None if tracking_type == "score" else today_log.done)
        )
        today_score = today_log.score if today_log and tracking_type == "score" else None
        stats[habit_id] = (streak, logged_today, today_score)
    return stats
