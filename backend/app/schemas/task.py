import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

TaskStatus = Literal["open", "in_progress", "done", "archived"]
TaskPriority = Literal["low", "normal", "high"]


class TaskCreate(BaseModel):
    title: str
    status: TaskStatus = "open"
    priority: TaskPriority = "normal"
    due: date | None = None
    scheduled: date | None = None
    context_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    outcome: str | None = None
    body: str | None = None
    source: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due: date | None = None
    scheduled: date | None = None
    context_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    outcome: str | None = None
    body: str | None = None
    source: str | None = None
    completed_at: datetime | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: str
    priority: str
    due: date | None
    scheduled: date | None
    context_id: uuid.UUID | None
    project_id: uuid.UUID | None
    outcome: str | None
    body: str | None
    source: str | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
