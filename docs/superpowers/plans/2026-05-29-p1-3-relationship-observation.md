# P1.3 — Relationship + Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the `relationship` entity (person↔person graph edges) and the polymorphic `observation` entity (dated notes attachable to any entity), each with full CRUD + the audit/undo write-path, reusing the proven Context/P1.2 pattern. Observation's list endpoint additionally supports filtering by subject.

**Architecture:** Identical write-path to P1.1/P1.2 (service is sole writer + records audit; API commits). Two new entity_type registrations for generic revert.

**Reference template (in repo, proven):** `app/models/context.py`, `app/services/context.py`, `app/api/contexts.py`, `app/schemas/context.py`, `tests/test_contexts_api.py`, `tests/helpers.py` (`login`). Follow the same **per-entity recipe** as the P1.2 plan (model → `__init__` → migration → schema → service [copy+substitute] → API [copy+substitute] → wire `main.py` → register in `ENTITY_MODELS` → tests → run `pytest && ruff && mypy && alembic upgrade head` → commit).

**Scope note:** Branch `feat/p0-foundations`; run from `backend/`; no AI attribution; full gate (`pytest`+`ruff`+`mypy`) at the end of EACH task. Current head migration `0008`, suite 47 passing, registry has context/project/company/person/task. Remaining after this slice (P1.4): `tag`/`entity_tag`/`entity_link`, then frontend CRUD.

---

### Task 1: Relationship (rev 0009, two FK → person)

- [ ] **Model `app/models/relationship.py`:**

```python
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Relationship(Base):
    __tablename__ = "relationship"
    __table_args__ = (
        UniqueConstraint("from_person_id", "to_person_id", "type", name="uq_relationship_edge"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("person.id"), index=True)
    to_person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("person.id"), index=True)
    type: Mapped[str] = mapped_column(String, default="knows")  # colleague|friend|family|mentor|...
    context_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("context.id"), nullable=True)
    since: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Migration `alembic/versions/0009_relationship.py`** (`revision="0009"`, `down_revision="0008"`): create `relationship` with the columns above; FKs `from_person_id`→`person.id`, `to_person_id`→`person.id`, `context_id`→`context.id` (nullable); indexes on `from_person_id`, `to_person_id`; unique constraint `uq_relationship_edge` on (`from_person_id`,`to_person_id`,`type`). Pre-wrap any line >100 chars.

```python
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "relationship",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "from_person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("person.id"), nullable=False
        ),
        sa.Column(
            "to_person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("person.id"), nullable=False
        ),
        sa.Column("type", sa.String(), nullable=False, server_default="knows"),
        sa.Column("context_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("context.id"), nullable=True),
        sa.Column("since", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("from_person_id", "to_person_id", "type", name="uq_relationship_edge"),
    )
    op.create_index("ix_relationship_from_person_id", "relationship", ["from_person_id"])
    op.create_index("ix_relationship_to_person_id", "relationship", ["to_person_id"])


def downgrade() -> None:
    op.drop_index("ix_relationship_to_person_id", table_name="relationship")
    op.drop_index("ix_relationship_from_person_id", table_name="relationship")
    op.drop_table("relationship")
```

- [ ] **Schema `app/schemas/relationship.py`:** `RelationshipCreate(from_person_id: uuid.UUID, to_person_id: uuid.UUID, type: str = "knows", context_id: uuid.UUID | None = None, since: date | None = None, notes: str | None = None)`; `RelationshipUpdate(all optional)`; `RelationshipOut(id, from_person_id, to_person_id, type, context_id, since, notes, created_at, updated_at)` with `from_attributes=True`.
- [ ] **Service/API/registry/wiring:** recipe steps 5–8 (`ENTITY = "relationship"`, router prefix `/relationships`, registry `"relationship": Relationship`).
- [ ] **Test `tests/test_relationships_api.py`:** in the CRUD test, create two `Person` rows via the `db` fixture, then create a relationship with `from_person_id`/`to_person_id` set to their ids; exercise list/get/patch/delete + 404.
- [ ] **Gate + commit:** `uv run pytest -v && uv run ruff check . && uv run mypy app && uv run alembic upgrade head`, then `git commit -m "feat(backend): add relationship CRUD with audit"`.

---

### Task 2: Observation (rev 0010, polymorphic subject, list filter)

- [ ] **Model `app/models/observation.py`:**

```python
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Observation(Base):
    __tablename__ = "observation"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_type: Mapped[str] = mapped_column(String)  # person|project|context|meeting|...
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    kind: Mapped[str] = mapped_column(String, default="observation")  # observation|preference|fact|open_loop|decision|key_point|open_question
    body: Mapped[str] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Migration `alembic/versions/0010_observation.py`** (`revision="0010"`, `down_revision="0009"`): create `observation` with the columns above; a composite index `ix_observation_subject` on (`subject_type`, `subject_id`). Pre-wrap lines >100 chars (the `kind` comment can be dropped in the migration).

- [ ] **Schema `app/schemas/observation.py`:** `ObservationCreate(subject_type: str, subject_id: uuid.UUID, body: str, kind: str = "observation", date: date | None = None, source: str | None = None)`; `ObservationUpdate(all optional — including subject_type/subject_id optional)`; `ObservationOut(id, subject_type, subject_id, date, kind, body, source, created_at, updated_at)`.

- [ ] **Service `app/services/observation.py`:** copy `app/services/context.py` and substitute (`ENTITY = "observation"`, `Observation`, `ObservationCreate/Update`), BUT change `list_observations` to accept optional subject filters:

```python
async def list_observations(
    db: AsyncSession,
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
) -> list[Observation]:
    stmt = select(Observation)
    if subject_type is not None:
        stmt = stmt.where(Observation.subject_type == subject_type)
    if subject_id is not None:
        stmt = stmt.where(Observation.subject_id == subject_id)
    result = await db.execute(stmt.order_by(Observation.created_at))
    return list(result.scalars().all())
```
Keep `get_observation`, `create_observation`, `update_observation`, `delete_observation` identical in shape to the Context service (with audit calls).

- [ ] **API `app/api/observations.py`:** copy `app/api/contexts.py` (prefix `/observations`, `ENTITY` via service) and change the list route to pass through the optional query params:

```python
@router.get("", response_model=list[ObservationOut])
async def list_observations(  # noqa: B008
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await svc.list_observations(db, subject_type=subject_type, subject_id=subject_id)
```
Keep create/get/patch/delete identical to contexts (with `await db.commit()` and `# noqa: B008`).

- [ ] **Registry/wiring:** add `"observation": Observation` to `ENTITY_MODELS`; include the router in `app/main.py`.

- [ ] **Test `tests/test_observations_api.py`:** create a `Person` via the `db` fixture; create an observation with `subject_type="person"`, `subject_id=str(person.id)`, `body="met at conf"`; exercise full CRUD + 404; AND assert the subject filter works: `GET /observations?subject_type=person&subject_id=<id>` returns the observation, while a different `subject_id` returns an empty list.

- [ ] **Gate + commit:** full gate green + `uv run alembic upgrade head` (→ `0010`), then `git commit -m "feat(backend): add observation CRUD with audit and subject filter"`.

---

### Task 3: Verification

- [ ] **Step 1:** Run from `backend/`: `uv run pytest -v`, `uv run ruff check .`, `uv run mypy app`, `uv run alembic upgrade head`, `uv run alembic current` (expect `0010 (head)`). All green.
- [ ] **Step 2:** Confirm `ENTITY_MODELS` now contains: context, project, company, person, task, relationship, observation (7 entries).
- [ ] **Step 3:** No new commit needed if Tasks 1–2 committed cleanly; otherwise commit any final lint fix as `chore(backend): lint fixes for relationship/observation`.

---

## Self-Review

**Spec coverage (SPEC §6.3 relationship, §6.11 observation):** relationship with directed person↔person edge + unique edge constraint ✓; observation polymorphic `(subject_type, subject_id)` with dated `kind`/`body`/`source` + subject-filtered list ✓. Both wired into the audit/undo registry. *Deferred to P1.4:* `tag`/`entity_tag`/`entity_link`; FK-existence validation (invalid FK → DB error, acceptable for this slice).

**Placeholder scan:** Models, migrations, schemas, and the two behavior-changing functions (observation list filter + route) are given in full. Service/API boilerplate is copied from the proven Context files with explicit substitutions.

**Type/name consistency:** `ENTITY = "relationship"` / `"observation"`; models `Relationship`/`Observation`; schemas `*Create/Update/Out`; prefixes `/relationships`, `/observations`; registry keys match; migrations chain `0008→0009→0010`. Observation `list_observations(db, subject_type=None, subject_id=None)` signature matches between service and API.

**Known fragility:** Observation has no `slug` (polymorphic note), so no unique-slug index — that's intentional. The `relationship` unique constraint may raise on duplicate edges (a 500 today); acceptable for this slice. `record_update`'s `db.refresh` (already in the shared audit service) covers the `onupdate` timestamp.
