from datetime import UTC, datetime, timedelta

from app.agent.notification_policy import (
    DEFAULT_NOTIFICATION_POLICY,
    NotificationEvaluationContext,
    evaluate_notification_policy,
    normalize_notification_policy,
)


def test_defaults_allow_daily_planning_in_app():
    policy = normalize_notification_policy({})
    result = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="daily_planning",
            urgency="normal",
            now=datetime(2026, 6, 22, 9, 0, tzinfo=UTC),
        ),
    )

    assert result.allowed is True
    assert result.channels == ["in_app"]
    assert result.reasons == []


def test_global_disable_blocks_even_critical_alerts():
    policy = normalize_notification_policy({"enabled": False})
    result = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="system_alert",
            urgency="critical",
            now=datetime(2026, 6, 22, 10, 0, tzinfo=UTC),
        ),
    )

    assert result.allowed is False
    assert result.channels == []
    assert "global_disabled" in result.reasons


def test_routine_channel_and_enabled_controls_are_enforced():
    policy = normalize_notification_policy(
        {
            "routines": {
                "task_drift": {"enabled": False, "channel": "both"},
                "inbox_digest": {"channel": "telegram"},
            }
        }
    )

    disabled = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="task_drift",
            urgency="normal",
            now=datetime(2026, 6, 22, 10, 0, tzinfo=UTC),
        ),
    )
    telegram = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="inbox_digest",
            urgency="normal",
            now=datetime(2026, 6, 22, 10, 0, tzinfo=UTC),
        ),
    )

    assert disabled.allowed is False
    assert "routine_disabled" in disabled.reasons
    assert telegram.allowed is True
    assert telegram.channels == ["telegram"]


def test_quiet_hours_block_until_minimum_urgency():
    policy = normalize_notification_policy(DEFAULT_NOTIFICATION_POLICY)
    normal = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="daily_planning",
            urgency="normal",
            now=datetime(2026, 6, 22, 23, 0, tzinfo=UTC),
        ),
    )
    critical = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="daily_planning",
            urgency="critical",
            now=datetime(2026, 6, 22, 23, 0, tzinfo=UTC),
        ),
    )

    assert normal.allowed is False
    assert "quiet_hours" in normal.reasons
    assert critical.allowed is True
    assert "quiet_hours_overridden" in critical.reasons


def test_quiet_hours_use_configured_timezone_offset():
    policy = normalize_notification_policy(
        {
            "quiet_hours": {
                "enabled": True,
                "start": "22:00",
                "end": "07:00",
                "timezone_offset_minutes": 300,
            }
        }
    )
    result = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="daily_planning",
            urgency="normal",
            now=datetime(2026, 6, 22, 20, 0, tzinfo=UTC),
        ),
    )

    assert result.allowed is False
    assert "quiet_hours" in result.reasons


def test_identical_quiet_hour_bounds_do_not_block_all_day():
    policy = normalize_notification_policy(
        {"quiet_hours": {"enabled": True, "start": "22:00", "end": "22:00"}}
    )
    result = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="daily_planning",
            urgency="normal",
            now=datetime(2026, 6, 22, 23, 0, tzinfo=UTC),
        ),
    )

    assert result.allowed is True
    assert "quiet_hours" not in result.reasons


def test_naive_datetimes_are_normalized_to_utc():
    now = datetime(2026, 6, 22, 14, 0)
    policy = normalize_notification_policy({"default_cooldown_minutes": 120})
    result = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="relationship_followup",
            urgency="normal",
            now=now,
            last_sent_at=datetime(2026, 6, 22, 13, 30),
        ),
    )

    assert result.allowed is False
    assert "cooldown" in result.reasons


def test_frequency_cap_and_cooldown_are_enforced_with_overrides():
    now = datetime(2026, 6, 22, 14, 0, tzinfo=UTC)
    policy = normalize_notification_policy(
        {
            "default_max_per_day": 1,
            "default_cooldown_minutes": 120,
            "urgency_overrides": {
                "frequency_cap_min_urgency": "critical",
                "cooldown_min_urgency": "high",
            },
        }
    )
    normal = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="relationship_followup",
            urgency="normal",
            now=now,
            sent_today=1,
            last_sent_at=now - timedelta(minutes=30),
            last_triggered_at=now - timedelta(minutes=30),
        ),
    )
    high = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="relationship_followup",
            urgency="high",
            now=now,
            sent_today=1,
            last_sent_at=now - timedelta(minutes=30),
            last_triggered_at=now - timedelta(minutes=30),
        ),
    )
    critical = evaluate_notification_policy(
        policy,
        NotificationEvaluationContext(
            routine="relationship_followup",
            urgency="critical",
            now=now,
            sent_today=1,
            last_sent_at=now - timedelta(minutes=30),
            last_triggered_at=now - timedelta(minutes=30),
        ),
    )

    assert normal.allowed is False
    assert {"frequency_cap", "cooldown", "trigger_cooldown"}.issubset(normal.reasons)
    assert high.allowed is False
    assert "cooldown_overridden" in high.reasons
    assert "frequency_cap" in high.reasons
    assert critical.allowed is True
    assert "frequency_cap_overridden" in critical.reasons
