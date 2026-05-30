import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ContextCreate(BaseModel):
    slug: str
    name: str
    category: str = "other"
    description: str | None = None
    status: str = "active"


class ContextUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    category: str | None = None
    description: str | None = None
    status: str | None = None


class ContextOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    category: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime
