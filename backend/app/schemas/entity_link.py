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
    from_name: str | None = None
    from_slug: str | None = None
    to_type: str
    to_id: uuid.UUID
    to_name: str | None = None
    to_slug: str | None = None
    kind: str
    created_at: datetime
