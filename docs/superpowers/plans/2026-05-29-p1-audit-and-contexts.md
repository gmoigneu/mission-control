# P1.1 — Audit/Undo write-path + Contexts CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Establish the reusable mutation write-path for mission-control — every create/update/delete records a reversible `audit_log` entry — and prove it end-to-end with the first domain entity, **Context**, including a single-change undo endpoint.

**Architecture:** Domain services are the only writers. Each service create/update/delete flushes the row and records an `audit_log` entry with before/after JSON snapshots. A generic `revert_audit` applies the inverse using a per-entity-type model registry. API routes commit the request transaction. Tests run inside a connection-bound outer transaction with `join_transaction_mode="create_savepoint"` so endpoint `commit()` calls are safely rolled back per test.

**Tech Stack:** (unchanged) FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, pytest.

**Scope note:** First slice of spec phase **P1**. Delivers: commit-safe test isolation, `audit_log`, the `Context` entity with full CRUD API, and the audit list + revert API. Project, People/Companies/Relationships, Tasks, and the generic `observation`/`tag`/`entity_link` tables come in later P1 slices that reuse this exact pattern. No frontend in this slice. All commands run from `/Users/nls/projects/mission-control/backend`. Branch: `feat/p0-foundations`. No AI attribution in commits.

---

### Task 1: Commit-safe test database fixture

The current `db` fixture rolls back at teardown, which only works because tests never `commit()`. CRUD endpoints commit. Rebind the fixture to a connection-level transaction with savepoint join mode so commits inside a test are rolled back.

**Files:** Modify `backend/tests/conftest.py`

- [ ] **Step 1: Replace the `db` fixture** in `backend/tests/conftest.py` with:

```python
@pytest_asyncio.fixture(loop_scope="session")
async def db(engine) -> AsyncSession:
    connection = await engine.connect()
    trans = await connection.begin()
    sessionmaker = async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        class_=AsyncSession,
        join_transaction_mode="create_savepoint",
    )
    session = sessionmaker()
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await connection.close()
```

(Keep the `engine` and `client` fixtures as they are. `client` still overrides `get_db` to yield this `db`.)

- [ ] **Step 2: Run the full suite to confirm no regression**

Run: `uv run pytest -v`
Expected: the existing 20 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/conftest.py
git commit -m "test(backend): commit-safe db fixture via savepoint join mode"
```

---

### Task 2: AuditLog model + migration

**Files:**
- Create: `backend/app/models/audit.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/0003_audit_log.py`
- Test: `backend/tests/test_audit_model.py`

- [ ] **Step 1: Create `backend/app/models/audit.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor: Mapped[str] = mapped_column(String)  # user | agent | migration
    action: Mapped[str] = mapped_column(String)  # create | update | delete
    entity_type: Mapped[str] = mapped_column(String, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    before: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    surface: Mapped[str] = mapped_column(String)  # ui | chat | capture | voice | api | migration
    agent_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    reverted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 2: Update `backend/app/models/__init__.py`**

```python
from app.models.audit import AuditLog  # noqa: F401
from app.models.user import AppUser  # noqa: F401
```

- [ ] **Step 3: Create migration `backend/alembic/versions/0003_audit_log.py`**

```python
"""audit_log table

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("before", postgresql.JSONB(), nullable=True),
        sa.Column("after", postgresql.JSONB(), nullable=True),
        sa.Column("surface", sa.String(), nullable=False),
        sa.Column("agent_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reverted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_log_entity_type", "audit_log", ["entity_type"])
    op.create_index("ix_audit_log_entity_id", "audit_log", ["entity_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_log_entity_id", table_name="audit_log")
    op.drop_index("ix_audit_log_entity_type", table_name="audit_log")
    op.drop_table("audit_log")
```

- [ ] **Step 4: Write the test `backend/tests/test_audit_model.py`**

```python
import uuid

from sqlalchemy import select

from app.models.audit import AuditLog


async def test_create_audit_row(db):
    entry = AuditLog(
        actor="user",
        action="create",
        entity_type="context",
        entity_id=uuid.uuid4(),
        before=None,
        after={"slug": "x"},
        surface="ui",
    )
    db.add(entry)
    await db.flush()
    fetched = (await db.execute(select(AuditLog))).scalars().one()
    assert fetched.reverted is False
    assert fetched.after == {"slug": "x"}
```

- [ ] **Step 5: Run test + apply migration**

Run: `uv run pytest tests/test_audit_model.py -v` (expect pass), then `uv run alembic upgrade head` (expect `0003` applies).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/audit.py backend/app/models/__init__.py backend/alembic/versions/0003_audit_log.py backend/tests/test_audit_model.py
git commit -m "feat(backend): add audit_log model and migration"
```

---

### Task 3: Audit serialization helpers

**Files:**
- Create: `backend/app/audit/__init__.py` (empty)
- Create: `backend/app/audit/serialize.py`
- Test: `backend/tests/test_audit_serialize.py`

- [ ] **Step 1: Create empty `backend/app/audit/__init__.py`**

- [ ] **Step 2: Create `backend/app/audit/serialize.py`**

```python
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import inspect


def model_to_dict(obj: Any) -> dict[str, Any]:
    """JSON-serializable snapshot of a mapped object's columns."""
    return {attr.key: _jsonable(getattr(obj, attr.key)) for attr in inspect(obj).mapper.column_attrs}


def _jsonable(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def coerce_value(model: type, key: str, value: Any) -> Any:
    """Convert a JSON value back to the python type of the model column."""
    if value is None:
        return None
    column = inspect(model).columns[key]
    try:
        pytype = column.type.python_type
    except NotImplementedError:
        return value
    if pytype is uuid.UUID and isinstance(value, str):
        return uuid.UUID(value)
    if pytype is datetime and isinstance(value, str):
        return datetime.fromisoformat(value)
    if pytype is date and isinstance(value, str):
        return date.fromisoformat(value)
    if pytype is Decimal and isinstance(value, (int, float, str)):
        return Decimal(str(value))
    return value
```

- [ ] **Step 3: Write the test `backend/tests/test_audit_serialize.py`**

```python
import uuid
from datetime import datetime

from app.audit.serialize import coerce_value, model_to_dict
from app.models.audit import AuditLog


def test_model_to_dict_is_jsonable():
    eid = uuid.uuid4()
    entry = AuditLog(
        id=uuid.uuid4(), actor="user", action="create", entity_type="context",
        entity_id=eid, before=None, after={"a": 1}, surface="ui", reverted=False,
    )
    d = model_to_dict(entry)
    assert d["entity_id"] == str(eid)
    assert isinstance(d["id"], str)
    assert d["after"] == {"a": 1}


def test_coerce_value_roundtrips_uuid_and_datetime():
    u = uuid.uuid4()
    assert coerce_value(AuditLog, "entity_id", str(u)) == u
    dt = datetime(2026, 5, 29, 12, 0, 0)
    assert coerce_value(AuditLog, "created_at", dt.isoformat()) == dt
    assert coerce_value(AuditLog, "actor", "user") == "user"
```

- [ ] **Step 4: Run test** — `uv run pytest tests/test_audit_serialize.py -v` (expect pass).

- [ ] **Step 5: Commit**

```bash
git add backend/app/audit/__init__.py backend/app/audit/serialize.py backend/tests/test_audit_serialize.py
git commit -m "feat(backend): add audit serialization helpers"
```

---

### Task 4: Context model + migration

**Files:**
- Create: `backend/app/models/context.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/0004_context.py`
- Test: `backend/tests/test_context_model.py`

- [ ] **Step 1: Create `backend/app/models/context.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Context(Base):
    __tablename__ = "context"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String, default="other")  # work|personal|side|other
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")  # active|archived
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 2: Update `backend/app/models/__init__.py`** to also import `Context`:

```python
from app.models.audit import AuditLog  # noqa: F401
from app.models.context import Context  # noqa: F401
from app.models.user import AppUser  # noqa: F401
```

- [ ] **Step 3: Create migration `backend/alembic/versions/0004_context.py`**

```python
"""context table

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "context",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False, server_default="other"),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_context_slug", "context", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_context_slug", table_name="context")
    op.drop_table("context")
```

- [ ] **Step 4: Write the test `backend/tests/test_context_model.py`**

```python
from sqlalchemy import select

from app.models.context import Context


async def test_create_context(db):
    db.add(Context(slug="upsun", name="Upsun", category="work"))
    await db.flush()
    fetched = (await db.execute(select(Context).where(Context.slug == "upsun"))).scalar_one()
    assert fetched.id is not None
    assert fetched.status == "active"
```

- [ ] **Step 5: Run test + migrate** — `uv run pytest tests/test_context_model.py -v`; `uv run alembic upgrade head` (expect `0004`).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/context.py backend/app/models/__init__.py backend/alembic/versions/0004_context.py backend/tests/test_context_model.py
git commit -m "feat(backend): add context model and migration"
```

---

### Task 5: Audit record helpers, registry, and revert

**Files:**
- Create: `backend/app/audit/service.py`
- Create: `backend/app/audit/registry.py`
- Create: `backend/app/audit/revert.py`
- Test: `backend/tests/test_audit_revert.py`

- [ ] **Step 1: Create `backend/app/audit/service.py`**

```python
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.models.audit import AuditLog


async def record_create(
    db: AsyncSession, entity_type: str, obj: Any, *, actor: str = "user", surface: str = "api"
) -> AuditLog:
    entry = AuditLog(
        actor=actor, action="create", entity_type=entity_type, entity_id=obj.id,
        before=None, after=model_to_dict(obj), surface=surface,
    )
    db.add(entry)
    return entry


async def record_update(
    db: AsyncSession, entity_type: str, obj: Any, before: dict, *, actor: str = "user", surface: str = "api"
) -> AuditLog:
    entry = AuditLog(
        actor=actor, action="update", entity_type=entity_type, entity_id=obj.id,
        before=before, after=model_to_dict(obj), surface=surface,
    )
    db.add(entry)
    return entry


async def record_delete(
    db: AsyncSession, entity_type: str, before: dict, entity_id: uuid.UUID, *,
    actor: str = "user", surface: str = "api",
) -> AuditLog:
    entry = AuditLog(
        actor=actor, action="delete", entity_type=entity_type, entity_id=entity_id,
        before=before, after=None, surface=surface,
    )
    db.add(entry)
    return entry
```

- [ ] **Step 2: Create `backend/app/audit/registry.py`**

```python
from app.models.context import Context

# Maps audit_log.entity_type -> the SQLAlchemy model, for generic revert.
# Extend this as new entities are added.
ENTITY_MODELS: dict[str, type] = {
    "context": Context,
}
```

- [ ] **Step 3: Create `backend/app/audit/revert.py`**

```python
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.registry import ENTITY_MODELS
from app.audit.serialize import coerce_value, model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.audit import AuditLog


async def revert_audit(
    db: AsyncSession, audit: AuditLog, *, actor: str = "user", surface: str = "api"
) -> AuditLog:
    if audit.reverted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already reverted")
    model = ENTITY_MODELS.get(audit.entity_type)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot revert entity type '{audit.entity_type}'",
        )

    if audit.action == "create":
        obj = await db.get(model, audit.entity_id)
        if obj is not None:
            before = model_to_dict(obj)
            await db.delete(obj)
            await db.flush()
            await record_delete(db, audit.entity_type, before, audit.entity_id, actor=actor, surface=surface)
    elif audit.action == "update":
        obj = await db.get(model, audit.entity_id)
        if obj is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity no longer exists")
        before = model_to_dict(obj)
        for key, value in (audit.before or {}).items():
            setattr(obj, key, coerce_value(model, key, value))
        await db.flush()
        await record_update(db, audit.entity_type, obj, before, actor=actor, surface=surface)
    elif audit.action == "delete":
        data = {key: coerce_value(model, key, value) for key, value in (audit.before or {}).items()}
        obj = model(**data)
        db.add(obj)
        await db.flush()
        await record_create(db, audit.entity_type, obj, actor=actor, surface=surface)

    audit.reverted = True
    await db.flush()
    return audit
```

- [ ] **Step 4: Write the test `backend/tests/test_audit_revert.py`**

```python
import uuid

from sqlalchemy import func, select

from app.audit.revert import revert_audit
from app.audit.service import record_create, record_delete, record_update
from app.audit.serialize import model_to_dict
from app.models.audit import AuditLog
from app.models.context import Context


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def test_revert_create_deletes_entity(db):
    ctx = Context(slug="gaal", name="Gaal", category="side")
    db.add(ctx)
    await db.flush()
    audit = await record_create(db, "context", ctx, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    assert await db.get(Context, ctx.id) is None
    assert audit.reverted is True
    # a compensating delete audit row exists
    rows = (await db.execute(select(AuditLog).where(AuditLog.action == "delete"))).scalars().all()
    assert len(rows) == 1


async def test_revert_update_restores_previous_values(db):
    ctx = Context(slug="upsun", name="Upsun", category="work")
    db.add(ctx)
    await db.flush()
    before = model_to_dict(ctx)
    ctx.name = "Upsun Renamed"
    await db.flush()
    audit = await record_update(db, "context", ctx, before, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    restored = await db.get(Context, ctx.id)
    assert restored is not None
    assert restored.name == "Upsun"


async def test_revert_delete_reinserts_entity(db):
    ctx = Context(slug="num6", name="Number6", category="work")
    db.add(ctx)
    await db.flush()
    before = model_to_dict(ctx)
    cid = ctx.id
    await db.delete(ctx)
    await db.flush()
    audit = await record_delete(db, "context", before, cid, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    restored = await db.get(Context, cid)
    assert restored is not None
    assert restored.slug == "num6"


async def test_revert_twice_conflicts(db):
    from fastapi import HTTPException

    ctx = Context(slug="dup", name="Dup")
    db.add(ctx)
    await db.flush()
    audit = await record_create(db, "context", ctx, surface="ui")
    await db.flush()
    await revert_audit(db, audit, surface="ui")
    try:
        await revert_audit(db, audit, surface="ui")
        raise AssertionError("expected HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 409
```

- [ ] **Step 5: Run test** — `uv run pytest tests/test_audit_revert.py -v` (expect 4 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/audit/service.py backend/app/audit/registry.py backend/app/audit/revert.py backend/tests/test_audit_revert.py
git commit -m "feat(backend): add audit record helpers, registry, and revert"
```

---

### Task 6: Context schemas, service, and CRUD API

**Files:**
- Create: `backend/app/schemas/context.py`
- Create: `backend/app/services/context.py`
- Create: `backend/app/api/contexts.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_contexts_api.py`

- [ ] **Step 1: Create `backend/app/schemas/context.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ContextCreate(BaseModel):
    slug: str
    name: str
    category: str = "other"
    description: str | None = None
    status: str = "active"


class ContextUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    category: str | None = None
    description: str | None = None
    status: str | None = None


class ContextOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    category: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2: Create `backend/app/services/context.py`**

```python
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.context import Context
from app.schemas.context import ContextCreate, ContextUpdate

ENTITY = "context"


async def list_contexts(db: AsyncSession) -> list[Context]:
    result = await db.execute(select(Context).order_by(Context.created_at))
    return list(result.scalars().all())


async def get_context(db: AsyncSession, context_id: uuid.UUID) -> Context | None:
    return await db.get(Context, context_id)


async def create_context(db: AsyncSession, data: ContextCreate, *, surface: str = "api") -> Context:
    obj = Context(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_context(
    db: AsyncSession, obj: Context, data: ContextUpdate, *, surface: str = "api"
) -> Context:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_context(db: AsyncSession, obj: Context, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
```

- [ ] **Step 3: Create `backend/app/api/contexts.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.context import ContextCreate, ContextOut, ContextUpdate
from app.services import context as svc

router = APIRouter(prefix="/contexts", tags=["contexts"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ContextOut])
async def list_contexts(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await svc.list_contexts(db)


@router.post("", response_model=ContextOut, status_code=status.HTTP_201_CREATED)
async def create_context(payload: ContextCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_context(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{context_id}", response_model=ContextOut)
async def get_context(context_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_context(db, context_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{context_id}", response_model=ContextOut)
async def update_context(
    context_id: uuid.UUID, payload: ContextUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_context(db, context_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_context(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{context_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_context(context_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_context(db, context_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_context(db, obj, surface="ui")
    await db.commit()
```

- [ ] **Step 4: Wire the router in `backend/app/main.py`** — add `contexts` to the import and include it:

```python
from app.api import auth, contexts, health
```
and in `create_app()`, after `app.include_router(auth.router)`:
```python
    app.include_router(contexts.router)
```

- [ ] **Step 5: Write the test `backend/tests/test_contexts_api.py`**

```python
from app.models.user import AppUser
from app.security import hash_password


async def _login(client, db):
    db.add(AppUser(email="g@example.com", password_hash=hash_password("pw")))
    await db.flush()
    r = await client.post("/auth/login", json={"email": "g@example.com", "password": "pw"})
    assert r.status_code == 200


async def test_contexts_crud_requires_auth(client):
    assert (await client.get("/contexts")).status_code == 401


async def test_contexts_crud_flow(client, db):
    await _login(client, db)

    created = await client.post(
        "/contexts", json={"slug": "upsun", "name": "Upsun", "category": "work"}
    )
    assert created.status_code == 201
    cid = created.json()["id"]

    listing = await client.get("/contexts")
    assert listing.status_code == 200
    assert any(c["slug"] == "upsun" for c in listing.json())

    patched = await client.patch(f"/contexts/{cid}", json={"name": "Upsun PaaS"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Upsun PaaS"

    got = await client.get(f"/contexts/{cid}")
    assert got.json()["name"] == "Upsun PaaS"

    deleted = await client.delete(f"/contexts/{cid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/contexts/{cid}")).status_code == 404


async def test_get_missing_context_404(client, db):
    await _login(client, db)
    import uuid

    assert (await client.get(f"/contexts/{uuid.uuid4()}")).status_code == 404
```

- [ ] **Step 6: Run tests** — `uv run pytest tests/test_contexts_api.py -v` (expect pass).

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/context.py backend/app/services/context.py backend/app/api/contexts.py backend/app/main.py backend/tests/test_contexts_api.py
git commit -m "feat(backend): add context CRUD API with audit logging"
```

---

### Task 7: Audit list + revert API, and full-suite verification

**Files:**
- Create: `backend/app/schemas/audit.py`
- Create: `backend/app/api/audit.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_audit_api.py`

- [ ] **Step 1: Create `backend/app/schemas/audit.py`**

```python
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor: str
    action: str
    entity_type: str
    entity_id: uuid.UUID
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    surface: str
    reverted: bool
    created_at: datetime
```

- [ ] **Step 2: Create `backend/app/api/audit.py`**

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.revert import revert_audit
from app.db import get_db
from app.deps import get_current_user
from app.models.audit import AuditLog
from app.schemas.audit import AuditOut

router = APIRouter(prefix="/audit", tags=["audit"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[AuditOut])
async def list_audit(limit: int = 100, db: AsyncSession = Depends(get_db)):  # noqa: B008
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.post("/{audit_id}/revert", response_model=AuditOut)
async def revert(audit_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    audit = await db.get(AuditLog, audit_id)
    if audit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    result = await revert_audit(db, audit, surface="ui")
    await db.commit()
    return result
```

- [ ] **Step 3: Wire the router in `backend/app/main.py`** — add `audit` to the import and `app.include_router(audit.router)`:

```python
from app.api import audit, auth, contexts, health
```
and include it in `create_app()`.

- [ ] **Step 4: Write the test `backend/tests/test_audit_api.py`**

```python
from app.models.user import AppUser
from app.security import hash_password


async def _login(client, db):
    db.add(AppUser(email="g@example.com", password_hash=hash_password("pw")))
    await db.flush()
    assert (await client.post("/auth/login", json={"email": "g@example.com", "password": "pw"})).status_code == 200


async def test_create_then_revert_via_api(client, db):
    await _login(client, db)

    created = await client.post("/contexts", json={"slug": "gaal", "name": "Gaal"})
    cid = created.json()["id"]

    audit_list = await client.get("/audit")
    assert audit_list.status_code == 200
    create_entries = [a for a in audit_list.json() if a["action"] == "create" and a["entity_type"] == "context"]
    assert len(create_entries) >= 1
    audit_id = create_entries[0]["id"]

    reverted = await client.post(f"/audit/{audit_id}/revert")
    assert reverted.status_code == 200
    assert reverted.json()["reverted"] is True

    # the context is gone after reverting its creation
    assert (await client.get(f"/contexts/{cid}")).status_code == 404
```

- [ ] **Step 5: Run the FULL suite + lint + type-check**

Run (from `backend/`):
```bash
uv run pytest -v
uv run ruff check .
uv run mypy app
```
Expected: all tests pass (20 prior + the new audit/serialize/revert/context/audit-api tests), ruff clean, mypy clean. Fix any mypy findings minimally. Then `uv run alembic upgrade head` to confirm migrations `0003`+`0004` apply cleanly on the dev DB.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/audit.py backend/app/api/audit.py backend/app/main.py backend/tests/test_audit_api.py
git commit -m "feat(backend): add audit list and revert API"
```

---

## Self-Review

**Spec coverage (P1 — this slice):**
- `audit_log` with before/after snapshots, actor/surface/reverted → Task 2 ✓
- Single write-path: services record audit on every create/update/delete → Tasks 5, 6 ✓
- Single-change revert (create→delete, update→restore, delete→reinsert) + compensating audit → Tasks 5, 7 ✓
- `context` entity full CRUD API behind auth → Task 6 ✓
- Audit list + revert API → Task 7 ✓
- Commit-safe test isolation (prerequisite for committing endpoints) → Task 1 ✓
- *Deferred to later P1 slices:* project, company, person, relationship, task, task_link, generic observation/tag/entity_link, whole-agent-run revert (needs agent_run, P5), frontend CRUD UI.

**Placeholder scan:** All steps contain complete code and concrete commands. No TODOs.

**Type/name consistency:** `model_to_dict`, `coerce_value`, `record_create/update/delete(db, entity_type, ...)`, `ENTITY_MODELS`, `revert_audit`, `Context`, `ContextCreate/Update/Out`, `svc.{list,get,create,update,delete}_context`, `AuditLog`, `AuditOut` are consistent across tasks. Services flush; API routes commit; tests rely on the Task 1 savepoint fixture so commits are isolated.

**Known fragility flagged for the executor:** `coerce_value` relies on `column.type.python_type`; for the columns used here (UUID, String, DateTime, Boolean, JSONB) this resolves correctly. The savepoint fixture (Task 1) requires SQLAlchemy 2.0's `join_transaction_mode="create_savepoint"` (installed). If a test that commits then needs to see prior-test data, that's a test-design error — each test is isolated by design.
