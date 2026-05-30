import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EntityTagCreate(BaseModel):
    tag_id: uuid.UUID
    subject_type: str
    subject_id: uuid.UUID


class EntityTagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tag_id: uuid.UUID
    subject_type: str
    subject_id: uuid.UUID
    created_at: datetime
