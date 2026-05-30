import uuid
from datetime import date as _date
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ObservationCreate(BaseModel):
    subject_type: str
    subject_id: uuid.UUID
    body: str
    kind: str = "observation"
    date: _date | None = None
    source: str | None = None


class ObservationUpdate(BaseModel):
    subject_type: str | None = None
    subject_id: uuid.UUID | None = None
    body: str | None = None
    kind: str | None = None
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
