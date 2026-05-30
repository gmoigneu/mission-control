import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.agent.persona_store import MAX_INSTRUCTIONS_CHARS


class PersonaUpdate(BaseModel):
    """Editable SOUL fields. Tool-use / safety mechanics are not editable."""

    name: str | None = Field(default=None, max_length=120)
    role: str | None = Field(default=None, max_length=400)
    tone: str | None = Field(default=None, max_length=400)
    greeting: str | None = Field(default=None, max_length=1000)
    instructions: str | None = Field(default=None, max_length=MAX_INSTRUCTIONS_CHARS)
    principles: str | None = Field(default=None, max_length=4000)
    boundaries: str | None = Field(default=None, max_length=4000)
    enabled: bool | None = None


class PersonaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID | None = None
    name: str
    role: str | None = None
    tone: str | None = None
    greeting: str | None = None
    instructions: str | None = None
    principles: str | None = None
    boundaries: str | None = None
    enabled: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None
    is_default: bool = False
