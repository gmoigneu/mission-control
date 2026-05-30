import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ToneCreate(BaseModel):
    slug: str
    name: str
    description: str | None = None
    sample: str | None = None


class ToneUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None
    sample: str | None = None


class ToneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    description: str | None
    sample: str | None
    created_at: datetime
    updated_at: datetime
