import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.task_link import TaskLinkCreate, TaskLinkOut
from app.services import task_link as svc

router = APIRouter(
    prefix="/task-links", tags=["task-links"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[TaskLinkOut])
async def list_task_links(  # noqa: B008
    response: Response,
    from_task_id: uuid.UUID | None = None,
    to_task_id: uuid.UUID | None = None,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_task_links(
        db, from_task_id=from_task_id, to_task_id=to_task_id
    )
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_task_links(
        db,
        from_task_id=from_task_id,
        to_task_id=to_task_id,
        limit=page.limit,
        offset=page.offset,
    )


@router.post("", response_model=TaskLinkOut, status_code=status.HTTP_201_CREATED)
async def create_task_link(payload: TaskLinkCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_task_link(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{task_link_id}", response_model=TaskLinkOut)
async def get_task_link(task_link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_task_link(db, task_link_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.delete("/{task_link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_link(task_link_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_task_link(db, task_link_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_task_link(db, obj, surface="ui")
    await db.commit()
