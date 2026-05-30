import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CompanyCreate(BaseModel):
    slug: str
    name: str
    domain: str | None = None
    notes: str | None = None


class CompanyUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    domain: str | None = None
    notes: str | None = None


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    domain: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
