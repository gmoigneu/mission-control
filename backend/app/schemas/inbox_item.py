import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

InboxSourceType = Literal["repo", "article", "tool", "idea", "video", "other"]
InboxStatus = Literal["queued", "reviewed", "archived"]
InboxPriority = Literal["low", "normal", "high"]


class InboxItemCreate(BaseModel):
    title: str
    source_type: InboxSourceType = "other"
    url: str | None = None
    status: InboxStatus = "queued"
    priority: InboxPriority = "normal"
    note: str | None = None


class InboxItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    source_type: InboxSourceType | None = None
    url: str | None = None
    status: InboxStatus | None = None
    priority: InboxPriority | None = None
    note: str | None = None


class InboxItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    source_type: str
    url: str | None
    status: str
    priority: str
    note: str | None
    created_at: datetime
    updated_at: datetime
