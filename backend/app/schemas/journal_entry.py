import uuid
from datetime import date as _date
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class JournalEntryCreate(BaseModel):
    date: _date
    body: str
    title: str | None = None
    mood: int | None = None
    energy: int | None = None
    source: str | None = None


class JournalEntryUpdate(BaseModel):
    date: _date | None = None
    body: str | None = None
    title: str | None = None
    mood: int | None = None
    energy: int | None = None
    source: str | None = None


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    date: _date
    title: str | None
    body: str
    mood: int | None
    energy: int | None
    source: str | None
    created_at: datetime
    updated_at: datetime
