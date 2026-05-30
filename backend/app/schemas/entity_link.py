import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EntityLinkCreate(BaseModel):
    from_type: str
    from_id: uuid.UUID
    to_type: str
    to_id: uuid.UUID
    kind: str = "related"


class EntityLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_type: str
    from_id: uuid.UUID
    to_type: str
    to_id: uuid.UUID
    kind: str
    created_at: datetime
