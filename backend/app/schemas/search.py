from pydantic import BaseModel


class SearchResult(BaseModel):
    subject_type: str
    subject_id: str
    score: float
    snippet: str
