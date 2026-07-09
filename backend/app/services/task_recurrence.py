import calendar
import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_update
from app.models.task import Task, TaskRecurrence
from app.schemas.task import TaskRecurrenceUpdate

ENTITY = "task_recurrence"

TEMPLATE_FIELDS = (
    "title",
    "priority",
    "context_id",
    "project_id",
    "outcome",
    "body",
    "source",
)


def validate_rule(frequency: str, weekday: int | None, month_day: int | None) -> None:
    if frequency not in {"daily", "weekly", "monthly"}:
        raise ValueError("frequency must be daily, weekly, or monthly")
    if frequency == "weekly" and weekday is None:
        raise ValueError("weekday is required for weekly recurrence")
    if frequency == "monthly" and month_day is None:
        raise ValueError("month_day is required for monthly recurrence")


def normalize_rule(
    frequency: str, weekday: int | None, month_day: int | None
) -> tuple[int | None, int | None]:
    validate_rule(frequency, weekday, month_day)
    if frequency == "daily":
        return None, None
    if frequency == "weekly":
        return weekday, None
    return None, month_day


def first_occurrence(recurrence: TaskRecurrence) -> date:
    return occurrence_on_or_after(recurrence, recurrence.start_date)


def next_occurrence_after(recurrence: TaskRecurrence, after: date) -> date:
    if recurrence.frequency == "daily":
        return after.fromordinal(after.toordinal() + 1)
    if recurrence.frequency == "weekly":
        weekday = recurrence.weekday
        if weekday is None:
            raise ValueError("weekday is required for weekly recurrence")
        delta = (weekday - after.weekday()) % 7
        if delta == 0:
            delta = 7
        return after.fromordinal(after.toordinal() + delta)
    return _monthly_occurrence_after(after, recurrence.month_day)


def occurrence_on_or_after(recurrence: TaskRecurrence, start: date) -> date:
    if recurrence.frequency == "daily":
        return start
    if recurrence.frequency == "weekly":
        weekday = recurrence.weekday
        if weekday is None:
            raise ValueError("weekday is required for weekly recurrence")
        return start.fromordinal(start.toordinal() + ((weekday - start.weekday()) % 7))
    candidate = _monthly_candidate(start.year, start.month, recurrence.month_day)
    if candidate < start:
        return _monthly_candidate_for_month_offset(start, 1, recurrence.month_day)
    return candidate


def generated_task(recurrence: TaskRecurrence, scheduled: date) -> Task:
    values = {field: getattr(recurrence, field) for field in TEMPLATE_FIELDS}
    return Task(
        **values,
        status="open",
        completed_at=None,
        scheduled=scheduled,
        due=None,
        recurrence_id=recurrence.id,
        recurrence=recurrence,
    )


async def get_task_recurrence(
    db: AsyncSession, recurrence_id: uuid.UUID
) -> TaskRecurrence | None:
    return await db.get(TaskRecurrence, recurrence_id)


async def update_task_recurrence(
    db: AsyncSession,
    obj: TaskRecurrence,
    data: TaskRecurrenceUpdate,
    *,
    surface: str = "api",
) -> TaskRecurrence:
    changes = data.model_dump(exclude_unset=True)
    next_frequency = changes.get("frequency", obj.frequency)
    next_weekday = changes.get("weekday", obj.weekday)
    next_month_day = changes.get("month_day", obj.month_day)
    next_weekday, next_month_day = normalize_rule(next_frequency, next_weekday, next_month_day)
    changes["weekday"] = next_weekday
    changes["month_day"] = next_month_day

    before = model_to_dict(obj)
    for key, value in changes.items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def disable_task_recurrence(
    db: AsyncSession, obj: TaskRecurrence, *, surface: str = "api"
) -> TaskRecurrence:
    return await update_task_recurrence(
        db, obj, TaskRecurrenceUpdate(active=False), surface=surface
    )


def _monthly_occurrence_after(after: date, month_day: int | None) -> date:
    candidate = _monthly_candidate(after.year, after.month, month_day)
    if candidate > after:
        return candidate
    return _monthly_candidate_for_month_offset(after, 1, month_day)


def _monthly_candidate_for_month_offset(start: date, offset: int, month_day: int | None) -> date:
    month_index = start.month - 1 + offset
    year = start.year + (month_index // 12)
    month = (month_index % 12) + 1
    return _monthly_candidate(year, month, month_day)


def _monthly_candidate(year: int, month: int, month_day: int | None) -> date:
    if month_day is None:
        raise ValueError("month_day is required for monthly recurrence")
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(month_day, last_day))
