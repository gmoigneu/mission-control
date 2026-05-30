import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class PersonCreate(BaseModel):
    slug: str
    name: str
    role: str | None = None
    company_id: uuid.UUID | None = None
    email: str | None = None
    linkedin: str | None = None
    first_met: date | None = None
    primary_context_id: uuid.UUID | None = None
    summary: str | None = None
    archived: bool = False


class PersonUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    role: str | None = None
    company_id: uuid.UUID | None = None
    email: str | None = None
    linkedin: str | None = None
    first_met: date | None = None
    primary_context_id: uuid.UUID | None = None
    summary: str | None = None
    archived: bool | None = None


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    role: str | None
    company_id: uuid.UUID | None
    email: str | None
    linkedin: str | None
    first_met: date | None
    primary_context_id: uuid.UUID | None
    summary: str | None
    archived: bool
    created_at: datetime
    updated_at: datetime
