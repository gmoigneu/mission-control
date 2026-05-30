import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TaskLinkCreate(BaseModel):
    from_task_id: uuid.UUID
    to_task_id: uuid.UUID
    kind: Literal["related", "blocks", "duplicates"] = "related"


class TaskLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_task_id: uuid.UUID
    to_task_id: uuid.UUID
    kind: str
    created_at: datetime
