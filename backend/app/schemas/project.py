import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProjectCreate(BaseModel):
    context_id: uuid.UUID
    slug: str
    title: str
    status: str = "active"
    purpose: str | None = None
    body: str | None = None


class ProjectUpdate(BaseModel):
    context_id: uuid.UUID | None = None
    slug: str | None = None
    title: str | None = None
    status: str | None = None
    purpose: str | None = None
    body: str | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    context_id: uuid.UUID
    slug: str
    title: str
    status: str
    purpose: str | None
    body: str | None
    created_at: datetime
    updated_at: datetime
