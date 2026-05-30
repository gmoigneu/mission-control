import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.context import ContextCreate, ContextOut, ContextUpdate
from app.services import context as svc

router = APIRouter(prefix="/contexts", tags=["contexts"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ContextOut])
async def list_contexts(
    response: Response,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_contexts(db)
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_contexts(db, limit=page.limit, offset=page.offset)


@router.post("", response_model=ContextOut, status_code=status.HTTP_201_CREATED)
async def create_context(payload: ContextCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_context(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{context_id}", response_model=ContextOut)
async def get_context(context_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_context(db, context_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{context_id}", response_model=ContextOut)
async def update_context(
    context_id: uuid.UUID, payload: ContextUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_context(db, context_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_context(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{context_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_context(context_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_context(db, context_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_context(db, obj, surface="ui")
    await db.commit()
