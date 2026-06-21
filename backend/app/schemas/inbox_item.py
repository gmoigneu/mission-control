import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

InboxStatus = Literal["open", "processed"]


class InboxItemCreate(BaseModel):
    body: str
    status: InboxStatus = "open"
    source: str | None = None
    capture_id: uuid.UUID | None = None
    triage_reason: str | None = None
    suggested_action: str | None = None
    source_metadata: dict[str, Any] = Field(default_factory=dict)


class InboxItemUpdate(BaseModel):
    body: str | None = None
    status: InboxStatus | None = None
    source: str | None = None
    capture_id: uuid.UUID | None = None
    triage_reason: str | None = None
    suggested_action: str | None = None
    source_metadata: dict[str, Any] | None = None


class InboxItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    body: str
    status: str
    source: str | None
    capture_id: uuid.UUID | None
    triage_reason: str | None
    suggested_action: str | None
    source_metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime
