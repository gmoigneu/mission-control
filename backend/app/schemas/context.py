import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

ContextCategory = Literal["work", "personal", "side", "other"]
ContextStatus = Literal["active", "archived"]


class ContextCreate(BaseModel):
    slug: str
    name: str
    category: ContextCategory = "other"
    description: str | None = None
    status: ContextStatus = "active"


class ContextUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    category: ContextCategory | None = None
    description: str | None = None
    status: ContextStatus | None = None


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
