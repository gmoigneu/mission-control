import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PlanningKind = Literal[
    "evening_plan",
    "morning_triage",
    "midday_replan",
    "follow_through_nudge",
]
PlanningStatus = Literal["draft", "sent", "reviewed", "dismissed", "applied"]
PlanningAction = Literal[
    "keep_today",
    "move_tomorrow",
    "defer",
    "mark_done",
    "archive",
    "clarify",
    "convert_inbox_to_task",
    "none",
]


class PlanningMessageCreate(BaseModel):
    kind: PlanningKind
    status: PlanningStatus = "draft"
    title: str
    summary: str
    body: dict[str, Any] = Field(default_factory=dict)
    related_task_ids: list[uuid.UUID] = Field(default_factory=list)
    related_inbox_item_ids: list[uuid.UUID] = Field(default_factory=list)
    target_date: date
    app_link: str | None = None
    sent_channels: list[str] = Field(default_factory=list)
    agent_run_id: uuid.UUID | None = None


class PlanningMessageUpdate(BaseModel):
    status: PlanningStatus | None = None
    title: str | None = None
    summary: str | None = None
    body: dict[str, Any] | None = None


class PlanningMessageGenerate(BaseModel):
    kind: PlanningKind
    target_date: date | None = None
    deliver_telegram: bool = False


class PlanningApplyItem(BaseModel):
    recommendation_id: str
    action: PlanningAction | None = None
    changes: dict[str, Any] | None = None


class PlanningApplyRequest(BaseModel):
    items: list[PlanningApplyItem]


class PlanningApplyResult(BaseModel):
    message: "PlanningMessageOut"
    applied: list[str]
    audit_link: str = "/activity"


class PlanningMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    status: str
    title: str
    summary: str
    body: dict[str, Any]
    related_task_ids: list[uuid.UUID]
    related_inbox_item_ids: list[uuid.UUID]
    target_date: date
    app_link: str
    sent_channels: list[str]
    agent_run_id: uuid.UUID | None
    sent_at: datetime | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


PlanningApplyResult.model_rebuild()
