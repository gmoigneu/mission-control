import uuid
from datetime import date as _date
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


def _validate_1_to_5(value: int | None) -> int | None:
    if value is not None and not 1 <= value <= 5:
        raise ValueError("must be between 1 and 5")
    return value


class JournalEntryCreate(BaseModel):
    date: _date
    summary: str | None = None
    mood: int | None = None
    energy: int | None = None
    telos_alignment: str | None = None
    body: str | None = None

    @field_validator("mood", "energy")
    @classmethod
    def _check_range(cls, value: int | None) -> int | None:
        return _validate_1_to_5(value)


class JournalEntryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str | None = None
    mood: int | None = None
    energy: int | None = None
    telos_alignment: str | None = None
    body: str | None = None

    @field_validator("mood", "energy")
    @classmethod
    def _check_range(cls, value: int | None) -> int | None:
        return _validate_1_to_5(value)


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    date: _date
    summary: str | None
    mood: int | None
    energy: int | None
    telos_alignment: str | None
    body: str | None
    created_at: datetime
    updated_at: datetime


class JournalLogCreate(BaseModel):
    text: str
    at: datetime | None = None


class JournalLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    journal_entry_id: uuid.UUID
    at: datetime
    text: str
    created_at: datetime
