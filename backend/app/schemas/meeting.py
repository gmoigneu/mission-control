import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MeetingCreate(BaseModel):
    slug: str
    title: str
    at: datetime
    context_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    location: str | None = None
    body: str | None = None


class MeetingUpdate(BaseModel):
    slug: str | None = None
    title: str | None = None
    at: datetime | None = None
    context_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    location: str | None = None
    body: str | None = None


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    at: datetime
    context_id: uuid.UUID | None
    project_id: uuid.UUID | None
    location: str | None
    body: str | None
    created_at: datetime
    updated_at: datetime
