from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_update
from app.models.proactive_preference import ProactivePreference
from app.schemas.proactive_preference import (
    ProactiveFeedbackCreate,
    ProactivePolicyDecision,
    ProactivePolicyRequest,
    ProactivePreferenceUpdate,
)

ENTITY = "proactive_preference"
BROAD_ACTIONS = {"change_channel", "change_frequency", "urgent_when_happens"}
BLOCKING_TYPES = {
    "mute_routine",
    "mute_entity_topic",
    "do_not_show_again",
    "never_at_this_time",
    "remind_later",
}


class ConfirmationRequired(ValueError):
    pass


def _scope_for_feedback(data: ProactiveFeedbackCreate) -> str:
    if data.action == "mute_routine":
        return "routine"
    if data.action == "mute_entity_topic":
        return "entity_topic"
    if data.action == "never_at_this_time":
        return "routine" if data.routine_type else "global"
    if data.trigger_ref:
        return "trigger"
    if data.entity_ref:
        return "entity_topic"
    if data.routine_type:
        return "routine"
    return "global"


def _value_for_feedback(data: ProactiveFeedbackCreate) -> dict[str, Any]:
    value: dict[str, Any] = {"action": data.action}
    if data.action in {"useful", "not_useful"}:
        value["rating"] = data.action
    if data.action == "less_like_this":
        value["direction"] = "less"
    if data.action in {"mute_routine", "mute_entity_topic"}:
        value["muted"] = True
    if data.action == "remind_later" and data.remind_until is not None:
        value["until"] = data.remind_until.isoformat()
    if data.action == "do_not_show_again":
        value["show"] = False
    if data.action == "change_channel":
        value["channel"] = data.channel
    if data.action == "change_frequency":
        value["frequency"] = data.frequency
    if data.action == "never_at_this_time":
        value["time"] = data.never_at_time
        value["timezone_offset_minutes"] = data.timezone_offset_minutes
        value["window_minutes"] = 60
    if data.action == "urgent_when_happens":
        value["urgency"] = "urgent"
    return value


async def list_preferences(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    active: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ProactivePreference]:
    stmt = select(ProactivePreference).where(ProactivePreference.user_id == user_id)
    if active is not None:
        stmt = stmt.where(ProactivePreference.active == active)
    result = await db.execute(
        stmt.order_by(ProactivePreference.created_at.desc()).offset(offset).limit(limit)
    )
    return list(result.scalars().all())


async def get_preference(
    db: AsyncSession, preference_id: uuid.UUID, *, user_id: uuid.UUID
) -> ProactivePreference | None:
    result = await db.execute(
        select(ProactivePreference).where(
            ProactivePreference.id == preference_id,
            ProactivePreference.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def create_from_feedback(
    db: AsyncSession,
    data: ProactiveFeedbackCreate,
    *,
    user_id: uuid.UUID,
    surface: str = "api",
) -> ProactivePreference:
    requires_confirmation = data.action in BROAD_ACTIONS
    if requires_confirmation and not data.confirmed:
        raise ConfirmationRequired(f"{data.action} requires explicit confirmation")

    now = datetime.now(UTC)
    obj = ProactivePreference(
        user_id=user_id,
        preference_type=data.action,
        scope=_scope_for_feedback(data),
        routine_type=data.routine_type,
        entity_type=data.entity_type,
        entity_ref=data.entity_ref,
        trigger_ref=data.trigger_ref,
        value=_value_for_feedback(data),
        source_proactive_run_id=data.source_proactive_run_id,
        requires_confirmation=requires_confirmation,
        active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_preference(
    db: AsyncSession,
    obj: ProactivePreference,
    data: ProactivePreferenceUpdate,
    *,
    surface: str = "api",
) -> ProactivePreference:
    before = model_to_dict(obj)
    obj.active = data.active
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _time_value_to_minutes(value: str | None) -> int | None:
    if not value:
        return None
    try:
        hour, minute = (int(part) for part in value.split(":", 1))
    except ValueError:
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour * 60 + minute


def _local_minutes(at: datetime, offset_minutes: int | None) -> int:
    if offset_minutes is None:
        local = at
    else:
        local = at.astimezone(UTC) - timedelta(minutes=offset_minutes)
    return local.hour * 60 + local.minute


def _within_time_window(
    *, blocked_time: str | None, at: datetime, offset_minutes: int | None, window_minutes: int
) -> bool:
    blocked = _time_value_to_minutes(blocked_time)
    if blocked is None:
        return False
    current = _local_minutes(at, offset_minutes)
    diff = abs(current - blocked)
    return min(diff, 24 * 60 - diff) <= window_minutes


async def _matching_active_preferences(
    db: AsyncSession, request: ProactivePolicyRequest, *, user_id: uuid.UUID
) -> list[ProactivePreference]:
    scope_filters = [ProactivePreference.scope == "global"]
    if request.routine_type:
        scope_filters.append(
            and_(
                ProactivePreference.scope == "routine",
                ProactivePreference.routine_type == request.routine_type,
            )
        )
    if request.entity_ref:
        scope_filters.append(
            and_(
                ProactivePreference.scope == "entity_topic",
                ProactivePreference.entity_ref == request.entity_ref,
                or_(
                    ProactivePreference.entity_type.is_(None),
                    ProactivePreference.entity_type == request.entity_type,
                ),
            )
        )
    if request.trigger_ref:
        scope_filters.append(
            and_(
                ProactivePreference.scope == "trigger",
                ProactivePreference.trigger_ref == request.trigger_ref,
            )
        )

    result = await db.execute(
        select(ProactivePreference)
        .where(
            ProactivePreference.user_id == user_id,
            ProactivePreference.active.is_(True),
            or_(*scope_filters),
        )
        .order_by(ProactivePreference.created_at.desc())
    )
    return list(result.scalars().all())


async def evaluate_policy(
    db: AsyncSession, request: ProactivePolicyRequest, *, user_id: uuid.UUID
) -> ProactivePolicyDecision:
    at = request.at or datetime.now(UTC)
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    prefs = await _matching_active_preferences(db, request, user_id=user_id)

    allowed = True
    reasons: list[str] = []
    channel = request.channel
    frequency: str | None = None
    channel_overridden = False
    frequency_overridden = False
    urgency = "normal"
    matched_ids: list[uuid.UUID] = []

    for pref in prefs:
        if pref.preference_type in BLOCKING_TYPES:
            if pref.preference_type == "remind_later":
                until = _parse_datetime(pref.value.get("until"))
                if until is None or until <= at:
                    continue
            if pref.preference_type == "never_at_this_time":
                if not _within_time_window(
                    blocked_time=pref.value.get("time"),
                    at=at,
                    offset_minutes=pref.value.get("timezone_offset_minutes"),
                    window_minutes=pref.value.get("window_minutes") or 60,
                ):
                    continue
            allowed = False
            reasons.append(pref.preference_type)
            matched_ids.append(pref.id)
            continue

        if pref.preference_type == "change_channel" and not channel_overridden:
            channel = pref.value.get("channel") or channel
            channel_overridden = True
            matched_ids.append(pref.id)
        if pref.preference_type == "change_frequency" and not frequency_overridden:
            frequency = pref.value.get("frequency") or frequency
            frequency_overridden = True
            matched_ids.append(pref.id)
        if pref.preference_type == "urgent_when_happens":
            urgency = "urgent"
            matched_ids.append(pref.id)
        if pref.preference_type == "less_like_this":
            frequency = "less"
            reasons.append("less_like_this")
            matched_ids.append(pref.id)

    return ProactivePolicyDecision(
        allowed=allowed,
        reasons=reasons,
        channel=channel,
        frequency=frequency,
        urgency=urgency,  # type: ignore[arg-type]
        matched_preference_ids=matched_ids,
    )
