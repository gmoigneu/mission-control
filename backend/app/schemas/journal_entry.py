import uuid
from datetime import date as _date
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

Score = int | None


class JournalEntryCreate(BaseModel):
    date: _date
    body: str
    title: str | None = None
    mood: Score = Field(default=None, ge=1, le=5)
    energy: Score = Field(default=None, ge=1, le=5)
    productivity: Score = Field(default=None, ge=1, le=5)
    source: str | None = None


class JournalEntryUpdate(BaseModel):
    date: _date | None = None
    body: str | None = None
    title: str | None = None
    mood: Score = Field(default=None, ge=1, le=5)
    energy: Score = Field(default=None, ge=1, le=5)
    productivity: Score = Field(default=None, ge=1, le=5)
    source: str | None = None


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    date: _date
    title: str | None
    body: str
    mood: int | None
    energy: int | None
    productivity: int | None
    source: str | None
    created_at: datetime
    updated_at: datetime


class DailyCheckInUpdate(BaseModel):
    mood: Score = Field(default=None, ge=1, le=5)
    energy: Score = Field(default=None, ge=1, le=5)
    productivity: Score = Field(default=None, ge=1, le=5)


class DailyCheckInOut(BaseModel):
    id: uuid.UUID | None
    date: _date
    mood: int | None
    energy: int | None
    productivity: int | None
    updated_at: datetime | None
