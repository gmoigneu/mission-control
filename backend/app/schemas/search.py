import uuid

from pydantic import BaseModel


class SearchResult(BaseModel):
    subject_type: str
    subject_id: uuid.UUID
    score: float
    snippet: str
    name: str | None = None
    slug: str | None = None
