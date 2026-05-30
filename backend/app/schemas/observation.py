import uuid
from datetime import date as _date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

ObservationKind = Literal[
    "observation", "preference", "fact", "open_loop", "decision", "key_point", "open_question"
]


class ObservationCreate(BaseModel):
    subject_type: str
    subject_id: uuid.UUID
    body: str
    kind: ObservationKind = "observation"
    date: _date | None = None
    source: str | None = None


class ObservationUpdate(BaseModel):
    body: str | None = None
    kind: ObservationKind | None = None
    date: _date | None = None
    source: str | None = None


class ObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject_type: str
    subject_id: uuid.UUID
    date: _date | None
    kind: str
    body: str
    source: str | None
    created_at: datetime
    updated_at: datetime
