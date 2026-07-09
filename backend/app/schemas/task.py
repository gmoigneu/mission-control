import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TaskStatus = Literal["open", "in_progress", "done", "archived"]
TaskPriority = Literal["low", "normal", "high"]
TaskRecurrenceFrequency = Literal["daily", "weekly", "monthly"]


class TaskRecurrenceRule(BaseModel):
    frequency: TaskRecurrenceFrequency
    start_date: date = Field(default_factory=date.today)
    weekday: int | None = Field(default=None, ge=0, le=6)
    month_day: int | None = Field(default=None, ge=1, le=31)

    @model_validator(mode="after")
    def validate_rule(self):
        if self.frequency == "weekly" and self.weekday is None:
            raise ValueError("weekday is required for weekly recurrence")
        if self.frequency == "monthly" and self.month_day is None:
            raise ValueError("month_day is required for monthly recurrence")
        if self.frequency == "daily":
            self.weekday = None
            self.month_day = None
        elif self.frequency == "weekly":
            self.month_day = None
        elif self.frequency == "monthly":
            self.weekday = None
        return self


class TaskRecurrenceCreate(TaskRecurrenceRule):
    pass


class TaskRecurrenceUpdate(BaseModel):
    title: str | None = None
    priority: TaskPriority | None = None
    context_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    outcome: str | None = None
    body: str | None = None
    source: str | None = None
    frequency: TaskRecurrenceFrequency | None = None
    start_date: date | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    month_day: int | None = Field(default=None, ge=1, le=31)
    active: bool | None = None


class TaskRecurrenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    priority: str
    context_id: uuid.UUID | None
    project_id: uuid.UUID | None
    outcome: str | None
    body: str | None
    source: str | None
    frequency: str
    start_date: date
    weekday: int | None
    month_day: int | None
    active: bool
    created_at: datetime
    updated_at: datetime


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
    recurrence: TaskRecurrenceCreate | None = None


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
    recurrence_id: uuid.UUID | None
    recurrence: TaskRecurrenceOut | None = None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
