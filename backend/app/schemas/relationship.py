import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class RelationshipCreate(BaseModel):
    from_person_id: uuid.UUID
    to_person_id: uuid.UUID
    type: str = "knows"
    context_id: uuid.UUID | None = None
    since: date | None = None
    notes: str | None = None


class RelationshipUpdate(BaseModel):
    from_person_id: uuid.UUID | None = None
    to_person_id: uuid.UUID | None = None
    type: str | None = None
    context_id: uuid.UUID | None = None
    since: date | None = None
    notes: str | None = None


class RelationshipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_person_id: uuid.UUID
    to_person_id: uuid.UUID
    type: str
    context_id: uuid.UUID | None
    since: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
