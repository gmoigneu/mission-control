import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.planning_message import (
    PlanningApplyRequest,
    PlanningApplyResult,
    PlanningMessageCreate,
    PlanningMessageGenerate,
    PlanningMessageOut,
    PlanningMessageUpdate,
)
from app.services import planning_message as svc

router = APIRouter(
    prefix="/planning/messages",
    tags=["planning"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[PlanningMessageOut])
async def list_messages(
    limit: int = Query(default=20, ge=1, le=100),
    target_date: date | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    return await svc.list_messages(db, limit=limit, target_date=target_date)


@router.post("", response_model=PlanningMessageOut, status_code=status.HTTP_201_CREATED)
async def create_message(
    payload: PlanningMessageCreate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.create_message(db, payload, surface="ui")
    await db.commit()
    return obj


@router.post("/generate", response_model=PlanningMessageOut, status_code=status.HTTP_201_CREATED)
async def generate_message(
    payload: PlanningMessageGenerate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.generate_message(db, payload)
    await db.commit()
    if payload.deliver_telegram:
        obj = await svc.deliver_to_telegram(db, obj)
        await db.commit()
    return obj


@router.get("/{message_id}", response_model=PlanningMessageOut)
async def get_message(
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_message(db, message_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{message_id}", response_model=PlanningMessageOut)
async def update_message(
    message_id: uuid.UUID,
    payload: PlanningMessageUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_message(db, message_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_message(db, obj, payload)
    await db.commit()
    return obj


@router.post("/{message_id}/apply", response_model=PlanningApplyResult)
async def apply_message(
    message_id: uuid.UUID,
    payload: PlanningApplyRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_message(db, message_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj, applied = await svc.apply_recommendations(db, obj, payload.items)
    await db.commit()
    return PlanningApplyResult(message=PlanningMessageOut.model_validate(obj), applied=applied)


@router.post("/{message_id}/deliver/telegram", response_model=PlanningMessageOut)
async def deliver_message_to_telegram(
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_message(db, message_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.deliver_to_telegram(db, obj)
    await db.commit()
    return obj
