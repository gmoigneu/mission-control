import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.proactive_preference import (
    ProactiveFeedbackCreate,
    ProactivePolicyDecision,
    ProactivePolicyRequest,
    ProactivePreferenceOut,
    ProactivePreferenceUpdate,
)
from app.services import proactive_preference as svc

router = APIRouter(
    prefix="/proactive-preferences",
    tags=["proactive-preferences"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[ProactivePreferenceOut])
async def list_proactive_preferences(
    active: bool | None = None,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    return await svc.list_preferences(db, active=active)


@router.post(
    "/feedback", response_model=ProactivePreferenceOut, status_code=status.HTTP_201_CREATED
)
async def create_feedback_preference(
    payload: ProactiveFeedbackCreate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    try:
        obj = await svc.create_from_feedback(db, payload, surface="ui")
    except svc.ConfirmationRequired as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    await db.commit()
    return obj


@router.patch("/{preference_id}", response_model=ProactivePreferenceOut)
async def update_proactive_preference(
    preference_id: uuid.UUID,
    payload: ProactivePreferenceUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await db.get(svc.ProactivePreference, preference_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_preference(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.post("/evaluate", response_model=ProactivePolicyDecision)
async def evaluate_proactive_policy(
    payload: ProactivePolicyRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    return await svc.evaluate_policy(db, payload)
