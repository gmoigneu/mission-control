import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.models.user import AppUser
from app.schemas.proactive_run import ProactiveRunOut, ProactiveRunUpdate
from app.services import proactive_run as svc

router = APIRouter(prefix="/proactive-runs", tags=["proactive-runs"])


@router.get("", response_model=list[ProactiveRunOut])
async def list_proactive_runs(  # noqa: B008
    response: Response,
    page: Page = Depends(page_params),  # noqa: B008
    routine_type: str | None = None,
    outcome: str | None = None,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_proactive_runs(
        db, user_id=user.id, routine_type=routine_type, outcome=outcome
    )
    runs = await svc.list_proactive_runs(
        db,
        user_id=user.id,
        routine_type=routine_type,
        outcome=outcome,
        limit=page.limit,
        offset=page.offset,
    )
    set_pagination_headers(response, total=total, page=page)
    return runs


@router.get("/{run_id}", response_model=ProactiveRunOut)
async def get_proactive_run(  # noqa: B008
    run_id: uuid.UUID,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_proactive_run(db, user_id=user.id, run_id=run_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{run_id}", response_model=ProactiveRunOut)
async def update_proactive_run(  # noqa: B008
    run_id: uuid.UUID,
    payload: ProactiveRunUpdate,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_proactive_run(db, user_id=user.id, run_id=run_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_proactive_run(db, obj, payload)
    await db.commit()
    return obj


@router.post("/{run_id}/dismiss", response_model=ProactiveRunOut)
async def dismiss_proactive_run(  # noqa: B008
    run_id: uuid.UUID,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_proactive_run(db, user_id=user.id, run_id=run_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.dismiss_proactive_run(db, obj)
    await db.commit()
    return obj


@router.post("/{run_id}/mute", response_model=ProactiveRunOut)
async def mute_proactive_run(  # noqa: B008
    run_id: uuid.UUID,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_proactive_run(db, user_id=user.id, run_id=run_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.mute_proactive_run(db, obj)
    await db.commit()
    return obj
