# P3 — Semantic search (pgvector) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Semantic search across entities. On every write, indexable entities are rendered to text, embedded, and stored as `chunk` rows (pgvector). A `GET /search` endpoint embeds the query and returns the nearest entities. A frontend search page makes it usable.

**Architecture:** A pluggable embedder (`fake` deterministic default so it runs/tests with no API key; `openai` behind config). An indexer renders an entity → text → embedding → upserts `chunk` rows (delete-then-insert per subject). The 6 text-bearing entity services (context, project, company, person, task, observation) call the indexer on create/update and a de-index on delete. Search runs cosine-distance ANN over `chunk` and hydrates a title per subject. `POST /admin/reindex` rebuilds all chunks.

**Tech Stack:** adds `pgvector` (python) for the SQLAlchemy `Vector` type + cosine distance. Backend FastAPI/SQLAlchemy as before; frontend TanStack.

**Scope note:** Branch `feat/p1-frontend-crud` (or a fresh `feat/p3-search` off main after merge — coordinator's choice; this plan assumes the current branch). Run backend cmds from `backend/`, frontend from `frontend/`. Full gate per task. Indexable subjects: context, project, company, person, task, observation. Embedding dim 1536 (config). `chunk` table created by a new migration; HNSW index added in the migration (tests use `create_all`, which omits the HNSW index — exact scan still returns correct results).

---

### Task 1: pgvector dep + chunk model + migration

**Files:** `backend/pyproject.toml`, `backend/app/models/chunk.py`, `backend/app/models/__init__.py`, `backend/alembic/versions/0014_chunk.py`, test `backend/tests/test_chunk_model.py`

- [ ] **Step 1:** Add `"pgvector>=0.3"` to `[project].dependencies` in `backend/pyproject.toml`; run `uv sync`.
- [ ] **Step 2: `backend/app/models/chunk.py`**

```python
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.config import settings
from app.db import Base


class Chunk(Base):
    __tablename__ = "chunk"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_type: Mapped[str] = mapped_column(String)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embeddings_dim))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 3:** Add `embeddings_dim: int = 1536`, `embeddings_provider: str = "fake"`, `embeddings_model: str = "text-embedding-3-small"`, `openai_api_key: str | None = None` to `Settings` in `backend/app/config.py`.
- [ ] **Step 4:** Add `from app.models.chunk import Chunk  # noqa: F401` to `backend/app/models/__init__.py`.
- [ ] **Step 5: Migration `0014_chunk.py`** (`revision="0014"`, `down_revision="0013"`): create `chunk` (id, subject_type, subject_id, chunk_index, content, `embedding vector(1536)`, updated_at); composite index `ix_chunk_subject` on (subject_type, subject_id); and `op.execute("CREATE INDEX ix_chunk_embedding ON chunk USING hnsw (embedding vector_cosine_ops)")`. Import `from pgvector.sqlalchemy import Vector` in the migration for the column type. Downgrade drops the indexes + table.
- [ ] **Step 6: Test `test_chunk_model.py`:** insert a `Chunk` with a 1536-float embedding (e.g. `[0.1]*1536`) for a random subject, flush, query it back, assert `len(row.embedding) == 1536`.
- [ ] **Step 7:** `uv run pytest tests/test_chunk_model.py -v`, `uv run alembic upgrade head` (→0014). Commit: `feat(backend): add chunk table for embeddings (pgvector)`

---

### Task 2: Pluggable embedder

**Files:** `backend/app/search/__init__.py` (empty), `backend/app/search/embedder.py`, test `backend/tests/test_embedder.py`

- [ ] **Step 1: `backend/app/search/embedder.py`**

```python
import hashlib
import math

from app.config import settings


def _tokenize(text: str) -> list[str]:
    return [t for t in "".join(c.lower() if c.isalnum() else " " for c in text).split() if t]


def _fake_embed(text: str, dim: int) -> list[float]:
    """Deterministic token-hashing embedding. No semantic model, but documents
    sharing tokens with the query get higher cosine similarity — enough for the
    search plumbing to work and be tested without an external API."""
    vec = [0.0] * dim
    for token in _tokenize(text):
        h = int(hashlib.md5(token.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0 if (h >> 8) % 2 == 0 else -1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    dim = settings.embeddings_dim
    if settings.embeddings_provider == "openai":
        return await _openai_embed(texts)
    return [_fake_embed(t, dim) for t in texts]


async def embed_text(text: str) -> list[float]:
    return (await embed_texts([text]))[0]


async def _openai_embed(texts: list[str]) -> list[list[float]]:
    # Lazy import so the dependency is optional unless provider=openai.
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.embeddings.create(model=settings.embeddings_model, input=texts)
    return [d.embedding for d in resp.data]
```

(Do NOT add the `openai` package to deps in this task — the import is lazy and only used when `provider=openai`. Note in the commit that enabling OpenAI requires `uv add openai` + `OPENAI_API_KEY` + `EMBEDDINGS_PROVIDER=openai`.)

- [ ] **Step 2: Test `test_embedder.py`:** `embed_text` returns a list of length `settings.embeddings_dim`; it's deterministic (same text → same vector); two texts sharing words have higher cosine similarity than two unrelated texts (compute cosine manually). All using the default `fake` provider.
- [ ] **Step 3:** `uv run pytest tests/test_embedder.py -v`. Commit: `feat(backend): add pluggable embedder (fake default, openai optional)`

---

### Task 3: Indexer

**Files:** `backend/app/search/index.py`, test `backend/tests/test_indexer.py`

- [ ] **Step 1: `backend/app/search/index.py`**

```python
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.search.embedder import embed_text


def render_subject(subject_type: str, obj: Any) -> str:
    """Render an entity to a single searchable text blob."""
    parts: list[str] = []
    for attr in ("name", "title", "slug", "role", "summary", "purpose", "body", "outcome",
                 "description", "notes", "type", "kind", "category", "status", "email"):
        val = getattr(obj, attr, None)
        if val:
            parts.append(str(val))
    return " — ".join(parts)


async def index_subject(db: AsyncSession, subject_type: str, obj: Any) -> None:
    text = render_subject(subject_type, obj)
    await db.execute(
        delete(Chunk).where(Chunk.subject_type == subject_type, Chunk.subject_id == obj.id)
    )
    if not text.strip():
        return
    embedding = await embed_text(text)
    db.add(
        Chunk(subject_type=subject_type, subject_id=obj.id, chunk_index=0, content=text, embedding=embedding)
    )
    await db.flush()


async def deindex_subject(db: AsyncSession, subject_type: str, subject_id: uuid.UUID) -> None:
    await db.execute(
        delete(Chunk).where(Chunk.subject_type == subject_type, Chunk.subject_id == subject_id)
    )
    await db.flush()
```

- [ ] **Step 2: Test `test_indexer.py`:** create a `Context` (name "Upsun", description "platform as a service"), call `index_subject(db, "context", ctx)`; assert one `Chunk` exists for it with non-empty content and a 1536-dim embedding; call `index_subject` again (update) and assert still exactly one chunk (delete-then-insert); `deindex_subject` removes it.
- [ ] **Step 3:** `uv run pytest tests/test_indexer.py -v`. Commit: `feat(backend): add entity indexer`

---

### Task 4: Wire auto-indexing into services + reindex admin endpoint

**Files:** modify `backend/app/services/{context,project,company,person,task,observation}.py`; create `backend/app/api/admin.py`; wire router in `backend/app/main.py`; test `backend/tests/test_reindex_api.py`

- [ ] **Step 1:** In EACH of the 6 services, after `record_create(...)` in `create_*` and after `record_update(...)` in `update_*`, add `await index_subject(db, ENTITY, obj)`. In each `delete_*`, after `record_delete(...)`, add `await deindex_subject(db, ENTITY, entity_id)`. Import `from app.search.index import deindex_subject, index_subject`.
- [ ] **Step 2: `backend/app/api/admin.py`** — `POST /admin/reindex` (behind `get_current_user`) that rebuilds chunks for all indexable entities:

```python
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.company import Company
from app.models.context import Context
from app.models.observation import Observation
from app.models.person import Person
from app.models.project import Project
from app.models.task import Task
from app.search.index import index_subject

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_user)])

_INDEXABLE = [
    ("context", Context),
    ("project", Project),
    ("company", Company),
    ("person", Person),
    ("task", Task),
    ("observation", Observation),
]


@router.post("/reindex")
async def reindex(db: AsyncSession = Depends(get_db)):  # noqa: B008
    count = 0
    for subject_type, model in _INDEXABLE:
        rows = (await db.execute(select(model))).scalars().all()
        for obj in rows:
            await index_subject(db, subject_type, obj)
            count += 1
    await db.commit()
    return {"reindexed": count}
```

- [ ] **Step 3:** Include `admin.router` in `app/main.py`.
- [ ] **Step 4: Test `test_reindex_api.py`:** login; create a context + a person via their APIs; `POST /admin/reindex` → `{"reindexed": >=2}`; assert chunks now exist (query the DB or rely on the search test in Task 5).
- [ ] **Step 5:** `uv run pytest -v && uv run ruff check . && uv run mypy app` (all green; fix minimally). Commit: `feat(backend): auto-index entities on write + reindex admin endpoint`

---

### Task 5: Search query + API

**Files:** `backend/app/search/query.py`, `backend/app/schemas/search.py`, `backend/app/api/search.py`, wire router, test `backend/tests/test_search_api.py`

- [ ] **Step 1: `backend/app/search/query.py`**

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.search.embedder import embed_text


async def semantic_search(
    db: AsyncSession, query: str, types: list[str] | None = None, limit: int = 20
) -> list[dict]:
    qvec = await embed_text(query)
    stmt = select(
        Chunk.subject_type,
        Chunk.subject_id,
        Chunk.content,
        Chunk.embedding.cosine_distance(qvec).label("distance"),
    )
    if types:
        stmt = stmt.where(Chunk.subject_type.in_(types))
    stmt = stmt.order_by("distance").limit(limit)
    rows = (await db.execute(stmt)).all()
    # Best (lowest distance) per subject.
    best: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = (r.subject_type, str(r.subject_id))
        score = 1.0 - float(r.distance)
        if key not in best or score > best[key]["score"]:
            best[key] = {
                "subject_type": r.subject_type,
                "subject_id": str(r.subject_id),
                "score": score,
                "snippet": r.content[:200],
            }
    return sorted(best.values(), key=lambda x: x["score"], reverse=True)
```

- [ ] **Step 2: `backend/app/schemas/search.py`** — `SearchResult(subject_type: str, subject_id: str, score: float, snippet: str)`.
- [ ] **Step 3: `backend/app/api/search.py`** — `GET /search?q=&types=&limit=` behind `get_current_user`, returns `list[SearchResult]`. Parse `types` as a comma-separated optional string. Wire the router in `main.py`.
- [ ] **Step 4: Test `test_search_api.py`:** login; create a person whose summary is "Senior Python backend engineer" and a context "Marketing"; `POST /admin/reindex`; `GET /search?q=python engineer` → the top result is the person (subject_type "person"); `GET /search?q=python engineer&types=context` → does not return the person (type filter). Use words that overlap so the fake embedder ranks them.
- [ ] **Step 5:** `uv run pytest -v && uv run ruff check . && uv run mypy app` (all green). Commit: `feat(backend): add semantic search query and API`

---

### Task 6: Frontend global search page

**Files:** `frontend/src/features/search/api.ts`, `frontend/src/routes/search.tsx`, register route, nav link, test `frontend/src/routes/search.test.tsx`

- [ ] **Step 1: types** — add to `src/lib/types.ts`: `SearchResult { subject_type: string; subject_id: string; score: number; snippet: string }`.
- [ ] **Step 2: `src/features/search/api.ts`** — `useSearch(query: string)`: a `useQuery` keyed `["search", query]`, `enabled: query.length > 0`, `queryFn: () => apiFetch<SearchResult[]>('/search?q=' + encodeURIComponent(query))`.
- [ ] **Step 3: `src/routes/search.tsx`** — `SearchPage` (RequireAuth + AppShell): a search `Input` (controlled, debounced or on Enter), and a `DataTable` of results (columns: Type, Snippet, Score). Export `searchRoute` (path `/search`); register in `router.tsx`.
- [ ] **Step 4: Nav** — add `{ to: "/search", label: "Search" }` near the top of `NAV` (after Dashboard) in `AppShell.tsx`.
- [ ] **Step 5: Test `search.test.tsx`:** stub `/auth/me`→200 and `/search?q=...`→`[{subject_type:"person",subject_id:"p1",score:0.9,snippet:"Python engineer"}]`; type a query, assert the result row renders and a GET to `/search` fired with the query.
- [ ] **Step 6:** Frontend gate green. Commit: `feat(frontend): add global semantic search page`

---

## Self-Review

**Spec coverage (SPEC §8):** chunk table + pgvector ✓; embeddings on write (auto-index in services) ✓; `semantic_search(query, types?, limit)` with cosine ANN + per-subject best score ✓; `GET /search` + `POST /admin/reindex` ✓; configurable embeddings provider/dim ✓; frontend search ✓. *Deferred:* chunking long text (single chunk per entity for now — fine at current sizes), hybrid keyword+vector fusion, indexing journal/meeting/knowledge/inbox (not built yet), background-worker indexing (done inline; acceptable at single-user scale — note latency if `provider=openai`).

**Placeholder scan:** embedder, indexer, search query, chunk model, admin/search APIs given in full; service wiring + frontend page have explicit instructions over the proven templates.

**Type/name consistency:** `embed_text/embed_texts`, `index_subject/deindex_subject/render_subject`, `semantic_search`, `Chunk`, `SearchResult`; `settings.embeddings_{dim,provider,model}`; migration `0013→0014`; the 6 services use their existing `ENTITY` constant when calling `index_subject(db, ENTITY, obj)`.

**Known fragility:** the `fake` embedder is for plumbing/tests, not real semantic quality — set `EMBEDDINGS_PROVIDER=openai` (+ `uv add openai`, `OPENAI_API_KEY`) for real search. The test DB lacks the HNSW index (created via raw SQL in the migration, not `create_all`); cosine ordering still works by exact scan. Inline indexing adds latency under `provider=openai` — move to a background worker in a later phase if needed.
