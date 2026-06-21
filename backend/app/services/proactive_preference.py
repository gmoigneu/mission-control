from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
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
        return "routine"
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
    if data.action == "urgent_when_happens":
        value["urgency"] = "urgent"
    return value


async def list_preferences(
    db: AsyncSession, *, active: bool | None = None
) -> list[ProactivePreference]:
    stmt = select(ProactivePreference)
    if active is not None:
        stmt = stmt.where(ProactivePreference.active == active)
    result = await db.execute(stmt.order_by(ProactivePreference.created_at.desc()))
    return list(result.scalars().all())


async def create_from_feedback(
    db: AsyncSession, data: ProactiveFeedbackCreate, *, surface: str = "api"
) -> ProactivePreference:
    requires_confirmation = data.action in BROAD_ACTIONS
    if requires_confirmation and not data.confirmed:
        raise ConfirmationRequired(f"{data.action} requires explicit confirmation")

    obj = ProactivePreference(
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


def _matches(pref: ProactivePreference, request: ProactivePolicyRequest) -> bool:
    if pref.scope == "global":
        return True
    if pref.scope == "routine":
        return bool(pref.routine_type and pref.routine_type == request.routine_type)
    if pref.scope == "entity_topic":
        return bool(
            pref.entity_ref
            and pref.entity_ref == request.entity_ref
            and (pref.entity_type is None or pref.entity_type == request.entity_type)
        )
    if pref.scope == "trigger":
        return bool(pref.trigger_ref and pref.trigger_ref == request.trigger_ref)
    return False


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


async def evaluate_policy(
    db: AsyncSession, request: ProactivePolicyRequest
) -> ProactivePolicyDecision:
    at = request.at or datetime.now(UTC)
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    prefs = await list_preferences(db, active=True)

    allowed = True
    reasons: list[str] = []
    channel = request.channel
    frequency: str | None = None
    urgency = "normal"
    matched_ids: list[uuid.UUID] = []

    for pref in prefs:
        if not _matches(pref, request):
            continue
        matched_ids.append(pref.id)

        if pref.preference_type in BLOCKING_TYPES:
            if pref.preference_type == "remind_later":
                until = _parse_datetime(pref.value.get("until"))
                if until is None or until <= at:
                    continue
            if pref.preference_type == "never_at_this_time":
                blocked_time = pref.value.get("time")
                if blocked_time != at.strftime("%H:%M"):
                    continue
            allowed = False
            reasons.append(pref.preference_type)

        if pref.preference_type == "change_channel":
            channel = pref.value.get("channel") or channel
        if pref.preference_type == "change_frequency":
            frequency = pref.value.get("frequency") or frequency
        if pref.preference_type == "urgent_when_happens":
            urgency = "urgent"

    return ProactivePolicyDecision(
        allowed=allowed,
        reasons=reasons,
        channel=channel,
        frequency=frequency,
        urgency=urgency,  # type: ignore[arg-type]
        matched_preference_ids=matched_ids,
    )
