import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

ProactiveOutcome = Literal["sent", "opened", "dismissed", "muted", "acted", "expired"]


class RelatedEntityRef(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    label: str | None = None


class ProactiveRunCreate(BaseModel):
    routine_type: str
    routine_name: str
    trigger_reason: str
    trigger_data_summary: str
    related_entities: list[RelatedEntityRef] = []
    policy_decision: str
    channels: list[str]
    message_title: str
    message_summary: str
    message_body: str
    delivery_status: dict[str, str] = {}
    outcome: ProactiveOutcome = "sent"
    agent_run_id: uuid.UUID | None = None
    audit_log_ids: list[uuid.UUID] = []


class ProactiveRunUpdate(BaseModel):
    delivery_status: dict[str, str] | None = None
    outcome: ProactiveOutcome | None = None
    agent_run_id: uuid.UUID | None = None
    audit_log_ids: list[uuid.UUID] | None = None


class ProactiveRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    routine_type: str
    routine_name: str
    trigger_reason: str
    trigger_data_summary: str
    related_entities: list[RelatedEntityRef]
    policy_decision: str
    channels: list[str]
    message_title: str
    message_summary: str
    message_body: str
    delivery_status: dict[str, str]
    outcome: ProactiveOutcome
    agent_run_id: uuid.UUID | None
    audit_log_ids: list[uuid.UUID]
    dismissed_at: datetime | None
    muted_at: datetime | None
    created_at: datetime
    updated_at: datetime


def json_ready(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    return value
