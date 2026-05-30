import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate
from app.services import task as svc

router = APIRouter(prefix="/tasks", tags=["tasks"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[TaskOut])
async def list_tasks(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await svc.list_tasks(db)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_task(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_task(db, task_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID, payload: TaskUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_task(db, task_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_task(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_task(db, task_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_task(db, obj, surface="ui")
    await db.commit()
