import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

InboxStatus = Literal["open", "processed"]


class InboxItemCreate(BaseModel):
    body: str
    status: InboxStatus = "open"
    source: str | None = None


class InboxItemUpdate(BaseModel):
    body: str | None = None
    status: InboxStatus | None = None
    source: str | None = None


class InboxItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    body: str
    status: str
    source: str | None
    created_at: datetime
    updated_at: datetime
