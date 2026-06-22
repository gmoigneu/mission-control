from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.notification_policy import (
    NotificationEvaluationContext,
    NotificationEvaluationResult,
    NotificationPolicy,
    evaluate_notification_policy,
    normalize_notification_policy,
)
from app.db import get_db
from app.deps import get_current_user
from app.models.user import AppUser

_SETTINGS_KEY = "notification_policy"

router = APIRouter(prefix="/agent/notification-policy", tags=["agent"])


@router.get("", response_model=NotificationPolicy)
async def get_notification_policy(
    user: AppUser = Depends(get_current_user),  # noqa: B008
) -> NotificationPolicy:
    return _policy_for_user(user)


@router.put("", response_model=NotificationPolicy)
async def update_notification_policy(
    payload: NotificationPolicy,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> NotificationPolicy:
    policy = normalize_notification_policy(payload)
    user.settings = {**(user.settings or {}), _SETTINGS_KEY: policy.model_dump(mode="json")}
    await db.commit()
    await db.refresh(user)
    return _policy_for_user(user)


@router.post("/evaluate", response_model=NotificationEvaluationResult)
async def evaluate_current_notification_policy(
    payload: NotificationEvaluationContext,
    user: AppUser = Depends(get_current_user),  # noqa: B008
) -> NotificationEvaluationResult:
    return evaluate_notification_policy(_policy_for_user(user), payload)


def _policy_for_user(user: AppUser) -> NotificationPolicy:
    return normalize_notification_policy((user.settings or {}).get(_SETTINGS_KEY))
