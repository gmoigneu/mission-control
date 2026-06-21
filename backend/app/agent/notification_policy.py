from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, time, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

NotificationRoutine = Literal[
    "daily_planning",
    "task_drift",
    "inbox_digest",
    "relationship_followup",
    "telos_review",
    "system_alert",
]
NotificationChannel = Literal["none", "in_app", "telegram", "both"]
NotificationUrgency = Literal["low", "normal", "high", "critical"]

ROUTINE_LABELS: dict[NotificationRoutine, str] = {
    "daily_planning": "Daily planning",
    "task_drift": "Task drift",
    "inbox_digest": "Inbox digest",
    "relationship_followup": "Relationship follow-up",
    "telos_review": "TELOS review",
    "system_alert": "System alert",
}
ROUTINES: tuple[NotificationRoutine, ...] = tuple(ROUTINE_LABELS.keys())

_URGENCY_RANK: dict[NotificationUrgency, int] = {
    "low": 0,
    "normal": 1,
    "high": 2,
    "critical": 3,
}


class QuietHoursPolicy(BaseModel):
    enabled: bool = True
    start: str = Field(default="22:00", pattern=r"^\d{2}:\d{2}$")
    end: str = Field(default="07:00", pattern=r"^\d{2}:\d{2}$")
    timezone_offset_minutes: int = Field(default=0, ge=-(14 * 60), le=14 * 60)

    @field_validator("start", "end")
    @classmethod
    def validate_time(cls, value: str) -> str:
        _parse_time(value)
        return value


class RoutineNotificationPolicy(BaseModel):
    enabled: bool = True
    channel: NotificationChannel | None = None
    max_per_day: int | None = Field(default=None, ge=0)
    cooldown_minutes: int | None = Field(default=None, ge=0)


class UrgencyOverridePolicy(BaseModel):
    quiet_hours_min_urgency: NotificationUrgency = "critical"
    frequency_cap_min_urgency: NotificationUrgency = "critical"
    cooldown_min_urgency: NotificationUrgency = "high"


class NotificationPolicy(BaseModel):
    model_config = ConfigDict(extra="ignore")

    enabled: bool = True
    quiet_hours: QuietHoursPolicy = Field(default_factory=QuietHoursPolicy)
    default_channel: NotificationChannel = "in_app"
    default_max_per_day: int = Field(default=3, ge=0)
    default_cooldown_minutes: int = Field(default=60, ge=0)
    urgency_overrides: UrgencyOverridePolicy = Field(default_factory=UrgencyOverridePolicy)
    routines: dict[NotificationRoutine, RoutineNotificationPolicy]


class NotificationEvaluationContext(BaseModel):
    routine: NotificationRoutine
    urgency: NotificationUrgency = "normal"
    now: datetime = Field(default_factory=lambda: datetime.now(UTC))
    sent_today: int = Field(default=0, ge=0)
    last_sent_at: datetime | None = None
    trigger_key: str | None = None
    last_triggered_at: datetime | None = None

    @field_validator("now", "last_sent_at", "last_triggered_at")
    @classmethod
    def normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class NotificationEvaluationResult(BaseModel):
    allowed: bool
    channels: list[Literal["in_app", "telegram"]]
    reasons: list[str]


DEFAULT_NOTIFICATION_POLICY: dict = {
    "enabled": True,
    "quiet_hours": {
        "enabled": True,
        "start": "22:00",
        "end": "07:00",
        "timezone_offset_minutes": 0,
    },
    "default_channel": "in_app",
    "default_max_per_day": 3,
    "default_cooldown_minutes": 60,
    "urgency_overrides": {
        "quiet_hours_min_urgency": "critical",
        "frequency_cap_min_urgency": "critical",
        "cooldown_min_urgency": "high",
    },
    "routines": {
        routine: {
            "enabled": True,
            "channel": "both" if routine == "system_alert" else "in_app",
            "max_per_day": None,
            "cooldown_minutes": None,
        }
        for routine in ROUTINES
    },
}


def normalize_notification_policy(raw: dict | NotificationPolicy | None) -> NotificationPolicy:
    if isinstance(raw, NotificationPolicy):
        raw_data = raw.model_dump(mode="json")
    else:
        raw_data = raw or {}
    merged = _deep_merge(deepcopy(DEFAULT_NOTIFICATION_POLICY), raw_data)
    for routine in ROUTINES:
        merged["routines"].setdefault(
            routine, deepcopy(DEFAULT_NOTIFICATION_POLICY["routines"][routine])
        )
    return NotificationPolicy.model_validate(merged)


def evaluate_notification_policy(
    policy: NotificationPolicy,
    context: NotificationEvaluationContext,
) -> NotificationEvaluationResult:
    routine_policy = policy.routines[context.routine]
    reasons: list[str] = []
    blocked = False

    if not policy.enabled:
        reasons.append("global_disabled")
        return NotificationEvaluationResult(allowed=False, channels=[], reasons=reasons)

    if not routine_policy.enabled:
        reasons.append("routine_disabled")
        blocked = True

    channel = routine_policy.channel or policy.default_channel
    channels = _channels_for(channel)
    if not channels:
        reasons.append("no_channels")
        blocked = True

    if policy.quiet_hours.enabled and _inside_quiet_hours(context.now, policy.quiet_hours):
        if _urgency_allows(context.urgency, policy.urgency_overrides.quiet_hours_min_urgency):
            reasons.append("quiet_hours_overridden")
        else:
            reasons.append("quiet_hours")
            blocked = True

    max_per_day = routine_policy.max_per_day
    if max_per_day is None:
        max_per_day = policy.default_max_per_day
    if context.sent_today >= max_per_day:
        if _urgency_allows(context.urgency, policy.urgency_overrides.frequency_cap_min_urgency):
            reasons.append("frequency_cap_overridden")
        else:
            reasons.append("frequency_cap")
            blocked = True

    cooldown_minutes = routine_policy.cooldown_minutes
    if cooldown_minutes is None:
        cooldown_minutes = policy.default_cooldown_minutes
    if _within_cooldown(context.now, context.last_sent_at, cooldown_minutes):
        if _urgency_allows(context.urgency, policy.urgency_overrides.cooldown_min_urgency):
            reasons.append("cooldown_overridden")
        else:
            reasons.append("cooldown")
            blocked = True
    if _within_cooldown(context.now, context.last_triggered_at, cooldown_minutes):
        if _urgency_allows(context.urgency, policy.urgency_overrides.cooldown_min_urgency):
            reasons.append("trigger_cooldown_overridden")
        else:
            reasons.append("trigger_cooldown")
            blocked = True

    return NotificationEvaluationResult(
        allowed=not blocked,
        channels=[] if blocked else channels,
        reasons=reasons,
    )


def _deep_merge(base: dict, override: dict) -> dict:
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            base[key] = _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def _channels_for(channel: NotificationChannel) -> list[Literal["in_app", "telegram"]]:
    if channel == "in_app":
        return ["in_app"]
    if channel == "telegram":
        return ["telegram"]
    if channel == "both":
        return ["in_app", "telegram"]
    return []


def _urgency_allows(actual: NotificationUrgency, minimum: NotificationUrgency) -> bool:
    return _URGENCY_RANK[actual] >= _URGENCY_RANK[minimum]


def _inside_quiet_hours(now: datetime, quiet_hours: QuietHoursPolicy) -> bool:
    local_now = now.astimezone(UTC) + timedelta(minutes=quiet_hours.timezone_offset_minutes)
    current = local_now.time()
    start = _parse_time(quiet_hours.start)
    end = _parse_time(quiet_hours.end)
    if start == end:
        return False
    if start < end:
        return start <= current < end
    return current >= start or current < end


def _parse_time(value: str) -> time:
    hour, minute = value.split(":", 1)
    return time(hour=int(hour), minute=int(minute))


def _within_cooldown(now: datetime, previous: datetime | None, minutes: int) -> bool:
    if previous is None:
        return False
    return (now - previous).total_seconds() < minutes * 60
