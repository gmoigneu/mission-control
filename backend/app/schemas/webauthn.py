import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class RegistrationVerifyRequest(BaseModel):
    # The PublicKeyCredential JSON produced by navigator.credentials.create().
    credential: dict[str, Any]
    name: str | None = None


class AuthenticationVerifyRequest(BaseModel):
    # The PublicKeyCredential JSON produced by navigator.credentials.get().
    credential: dict[str, Any]


class PasskeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str | None = None
    created_at: datetime
    last_used_at: datetime | None = None
