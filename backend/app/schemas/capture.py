import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

CaptureSurface = Literal["cmd_k", "chat", "voice", "telegram", "app"]
CaptureStatus = Literal["raw", "interpreted", "previewed", "applied", "inboxed", "dismissed", "failed"]
CaptureIntent = Literal[
    "create_task",
    "create_update_person",
    "create_update_company",
    "create_observation",
    "create_journal_entry",
    "create_meeting_note",
    "create_knowledge_source",
    "create_knowledge_note",
    "create_inbox_item",
    "link_existing_entities",
    "unknown",
]


class CaptureRequest(BaseModel):
    text: str
    transcript: str | None = None
    source_surface: CaptureSurface = "cmd_k"
    source_metadata: dict[str, Any] = Field(default_factory=dict)
    auto_apply: bool = False


class CaptureCandidate(BaseModel):
    id: str
    intent: CaptureIntent
    entity_type: str
    confidence: float
    fields: dict[str, Any]
    required_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    selected: bool = True


class CaptureResult(BaseModel):
    intent: CaptureIntent
    confidence: float
    ambiguity_notes: list[str] = Field(default_factory=list)
    suggested_next_action: str
    proposed_actions: list[CaptureCandidate] = Field(default_factory=list)


class CaptureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    raw_text: str
    transcript: str | None
    source_surface: str
    source_metadata: dict[str, Any]
    status: str
    confidence_summary: dict[str, Any]
    structured_result: dict[str, Any]
    agent_run_id: uuid.UUID | None
    created_entity_refs: list[dict[str, Any]]
    inbox_item_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class CaptureApplyRequest(BaseModel):
    actions: list[CaptureCandidate] | None = None


class CaptureInboxRequest(BaseModel):
    reason: str | None = None
    suggested_action: str | None = None


class CaptureApplyResponse(BaseModel):
    agent_run_id: uuid.UUID
    reply: str
    writes: list[dict[str, Any]]
    capture: CaptureOut | None


class InboxPromotionRequest(BaseModel):
    target: Literal["task", "observation", "knowledge_note", "journal_entry"]
    title: str | None = None
    body: str | None = None
    subject_type: str | None = None
    subject_id: uuid.UUID | None = None


class CaptureAgentResponse(BaseModel):
    agent_run_id: uuid.UUID
    reply: str
    writes: list[dict[str, Any]]
    conversation_id: uuid.UUID | None = None
    capture: CaptureOut
    result: CaptureResult
