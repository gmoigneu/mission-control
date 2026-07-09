import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.task import TaskRecurrenceOut, TaskRecurrenceUpdate
from app.services import task_recurrence as svc

router = APIRouter(
    prefix="/task-recurrences",
    tags=["task-recurrences"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/{recurrence_id}", response_model=TaskRecurrenceOut)
async def get_task_recurrence(
    recurrence_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_task_recurrence(db, recurrence_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{recurrence_id}", response_model=TaskRecurrenceOut)
async def update_task_recurrence(
    recurrence_id: uuid.UUID,
    payload: TaskRecurrenceUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_task_recurrence(db, recurrence_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    try:
        obj = await svc.update_task_recurrence(db, obj, payload, surface="ui")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    await db.commit()
    return obj


@router.post("/{recurrence_id}/disable", response_model=TaskRecurrenceOut)
async def disable_task_recurrence(
    recurrence_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_task_recurrence(db, recurrence_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.disable_task_recurrence(db, obj, surface="ui")
    await db.commit()
    return obj
