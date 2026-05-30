import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class KnowledgeCreate(BaseModel):
    slug: str
    title: str
    body: str | None = None


class KnowledgeUpdate(BaseModel):
    slug: str | None = None
    title: str | None = None
    body: str | None = None


class KnowledgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    title: str
    body: str | None
    created_at: datetime
    updated_at: datetime
