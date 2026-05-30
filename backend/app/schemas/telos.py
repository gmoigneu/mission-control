import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

TelosKind = Literal["mission", "goal", "problem", "metric", "value"]


class TelosCreate(BaseModel):
    kind: TelosKind
    title: str
    body: str | None = None
    parent_id: uuid.UUID | None = None


class TelosUpdate(BaseModel):
    kind: TelosKind | None = None
    title: str | None = None
    body: str | None = None
    parent_id: uuid.UUID | None = None


class TelosOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    title: str
    body: str | None
    parent_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
