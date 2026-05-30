import uuid
from datetime import date as date_
from datetime import datetime

from pydantic import BaseModel, ConfigDict

# NOTE: the `date` field name collides with the `date` type, so the type is
# imported as `date_`. Referencing the bare `date` type in an annotation with a
# default (e.g. `date: date | None = None`) makes Python/pydantic resolve `date`
# to the field default (None) → `None | None` TypeError at model build.


class ReviewCreate(BaseModel):
    period: str = "weekly"
    date: date_
    title: str
    body: str | None = None
    highlights: str | None = None


class ReviewUpdate(BaseModel):
    period: str | None = None
    date: date_ | None = None
    title: str | None = None
    body: str | None = None
    highlights: str | None = None


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    period: str
    date: date_
    title: str
    body: str | None
    highlights: str | None
    created_at: datetime
    updated_at: datetime
