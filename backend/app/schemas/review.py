import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ReviewCreate(BaseModel):
    period: str = "weekly"
    date: date
    title: str
    body: str | None = None
    highlights: str | None = None


class ReviewUpdate(BaseModel):
    period: str | None = None
    date: date | None = None
    title: str | None = None
    body: str | None = None
    highlights: str | None = None


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    period: str
    date: date
    title: str
    body: str | None
    highlights: str | None
    created_at: datetime
    updated_at: datetime
