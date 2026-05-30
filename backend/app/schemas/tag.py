import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    kind: str | None = None


class TagUpdate(BaseModel):
    name: str | None = None
    kind: str | None = None


class TagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str | None
    created_at: datetime
    updated_at: datetime
