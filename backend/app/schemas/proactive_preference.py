import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PreferenceAction = Literal[
    "useful",
    "not_useful",
    "less_like_this",
    "mute_routine",
    "mute_entity_topic",
    "remind_later",
    "do_not_show_again",
    "change_channel",
    "change_frequency",
    "never_at_this_time",
    "urgent_when_happens",
]

PreferenceScope = Literal["global", "routine", "entity_topic", "trigger"]


class ProactiveFeedbackCreate(BaseModel):
    action: PreferenceAction
    source_proactive_run_id: uuid.UUID | None = None
    routine_type: str | None = None
    entity_type: str | None = None
    entity_ref: str | None = None
    trigger_ref: str | None = None
    channel: str | None = None
    frequency: str | None = None
    remind_until: datetime | None = None
    never_at_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    confirmed: bool = False

    @model_validator(mode="after")
    def validate_action_payload(self) -> "ProactiveFeedbackCreate":
        if self.action == "mute_routine" and not self.routine_type:
            raise ValueError("routine_type is required to mute a routine")
        if self.action == "mute_entity_topic" and not self.entity_ref:
            raise ValueError("entity_ref is required to mute an entity/topic")
        if self.action == "remind_later" and self.remind_until is None:
            raise ValueError("remind_until is required for remind later")
        if self.action == "change_channel" and not self.channel:
            raise ValueError("channel is required to change channel")
        if self.action == "change_frequency" and not self.frequency:
            raise ValueError("frequency is required to change frequency")
        if self.action == "never_at_this_time" and not self.never_at_time:
            raise ValueError("never_at_time is required")
        return self


class ProactivePreferenceUpdate(BaseModel):
    active: bool


class ProactivePreferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    preference_type: str
    scope: str
    routine_type: str | None
    entity_type: str | None
    entity_ref: str | None
    trigger_ref: str | None
    value: dict
    source_proactive_run_id: uuid.UUID | None
    requires_confirmation: bool
    active: bool
    created_at: datetime
    updated_at: datetime


class ProactivePolicyRequest(BaseModel):
    routine_type: str | None = None
    entity_type: str | None = None
    entity_ref: str | None = None
    trigger_ref: str | None = None
    channel: str | None = None
    at: datetime | None = None


class ProactivePolicyDecision(BaseModel):
    allowed: bool
    reasons: list[str] = []
    channel: str | None = None
    frequency: str | None = None
    urgency: Literal["normal", "urgent"] = "normal"
    matched_preference_ids: list[uuid.UUID] = []
