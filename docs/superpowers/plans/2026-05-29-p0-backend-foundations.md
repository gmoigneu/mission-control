# Backend Foundations (P0.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the mission-control Python backend: a FastAPI app that boots, connects to Postgres+pgvector, runs Alembic migrations, and supports single-user session auth — fully tested with CI green.

**Architecture:** FastAPI (async) + SQLAlchemy 2.0 (async, asyncpg) + Alembic. Single domain service write-path pattern starts here with auth. Sessions via Starlette's signed-cookie `SessionMiddleware`. Passwords hashed with Argon2. Postgres (with the `vector` extension enabled by the first migration) runs in Docker for local dev and as a CI service container.

**Tech Stack:** Python 3.12, uv, FastAPI, SQLAlchemy 2.0 async, asyncpg, Alembic, pydantic-settings, argon2-cffi, Typer, pytest + pytest-asyncio + httpx, ruff, mypy, GitHub Actions.

**Scope note:** This plan is the first slice of spec phase **P0**. It deliberately excludes the frontend shell and the full multi-service Compose stack (Neo4j, worker, Caddy, frontend) — those are separate follow-on plans. The `docker-compose.yml` here contains **only Postgres** so tests have a database.

All paths are relative to the repo root `~/projects/mission-control/`. Backend code lives under `backend/`. Run all backend commands from `backend/` unless stated otherwise.

---

### Task 1: Initialize the uv project and tooling

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.python-version`
- Create: `backend/app/__init__.py` (empty)
- Create: `backend/tests/__init__.py` (empty)

- [ ] **Step 1: Create `backend/.python-version`**

```
3.12
```

- [ ] **Step 2: Create `backend/pyproject.toml`**

```toml
[project]
name = "mission-control-backend"
version = "0.1.0"
description = "mission-control backend (FastAPI + SQLAlchemy + LangChain)"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pydantic-settings>=2.6",
    "email-validator>=2.2",
    "argon2-cffi>=23.1",
    "itsdangerous>=2.2",
    "typer>=0.15",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "httpx>=0.28",
    "ruff>=0.8",
    "mypy>=1.13",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "session"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.mypy]
python_version = "3.12"
ignore_missing_imports = true
warn_unused_ignores = true

[tool.uv]
package = false
```

- [ ] **Step 3: Create empty package markers**

Create `backend/app/__init__.py` and `backend/tests/__init__.py`, both empty.

- [ ] **Step 4: Sync dependencies**

Run (from `backend/`): `uv sync`
Expected: creates `backend/.venv` and `backend/uv.lock`, installs all deps without error.

- [ ] **Step 5: Verify the toolchain runs**

Run: `uv run ruff check . && uv run python -c "import fastapi, sqlalchemy, alembic; print('ok')"`
Expected: `ok` printed, ruff reports no errors (no files yet).

- [ ] **Step 6: Commit**

```bash
git add backend/.python-version backend/pyproject.toml backend/uv.lock backend/app/__init__.py backend/tests/__init__.py
git commit -m "chore(backend): initialize uv project and tooling"
```

---

### Task 2: Settings/config module

**Files:**
- Create: `backend/app/config.py`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_config.py`:

```python
from app.config import Settings


def test_settings_defaults():
    s = Settings()
    assert s.database_url.startswith("postgresql+asyncpg://")
    assert s.environment == "development"


def test_settings_reads_env(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SESSION_SECRET", "xyz")
    s = Settings()
    assert s.environment == "production"
    assert s.session_secret == "xyz"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`.

- [ ] **Step 3: Write minimal implementation**

`backend/app/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://mc:mc@localhost:5432/mc"
    test_database_url: str = "postgresql+asyncpg://mc:mc@localhost:5432/mc_test"
    session_secret: str = "dev-insecure-change-me"
    initial_user_email: str | None = None
    initial_user_password: str | None = None


settings = Settings()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_config.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_config.py
git commit -m "feat(backend): add settings config"
```

---

### Task 3: Local Postgres for dev/test

**Files:**
- Create: `docker-compose.yml` (repo root)
- Create: `backend/.env.example`

- [ ] **Step 1: Create `docker-compose.yml` at the repo root**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: mc
      POSTGRES_PASSWORD: mc
      POSTGRES_DB: mc
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mc"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 2: Create `backend/.env.example`**

```
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://mc:mc@localhost:5432/mc
TEST_DATABASE_URL=postgresql+asyncpg://mc:mc@localhost:5432/mc_test
SESSION_SECRET=dev-insecure-change-me
INITIAL_USER_EMAIL=
INITIAL_USER_PASSWORD=
```

- [ ] **Step 3: Start Postgres and create the test database**

Run (from repo root):

```bash
docker compose up -d postgres
# wait for healthy, then create the test DB:
docker compose exec postgres psql -U mc -d mc -c "CREATE DATABASE mc_test;" || true
```

Expected: Postgres container healthy; `mc_test` database exists (the `|| true` tolerates re-runs).

- [ ] **Step 4: Verify connectivity**

Run: `docker compose exec postgres psql -U mc -d mc_test -c "SELECT 1;"`
Expected: returns one row with `1`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/.env.example
git commit -m "chore: add postgres compose service and env example"
```

---

### Task 4: Database engine, session, and Base

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: Write `backend/app/db.py`**

```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
```

- [ ] **Step 2: Write `backend/tests/conftest.py`**

```python
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401  (ensure all models register on Base.metadata)
from app.config import settings
from app.db import Base, get_db


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def engine():
    eng = create_async_engine(settings.test_database_url)
    async with eng.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(loop_scope="session")
async def db(engine) -> AsyncSession:
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with sessionmaker() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture(loop_scope="session")
async def client(db) -> AsyncClient:
    from app.main import app

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 3: Create `backend/app/models/__init__.py`**

```python
from app.models.user import AppUser  # noqa: F401
```

> Note: `app/models/user.py` does not exist yet; this import will fail until Task 5. To keep Task 4 runnable on its own, temporarily make `app/models/__init__.py` empty for this task, then replace it in Task 5. Create it empty now:

`backend/app/models/__init__.py` (empty file).

- [ ] **Step 4: Write the failing test**

`backend/tests/test_db.py`:

```python
from sqlalchemy import text


async def test_session_executes_select(db):
    result = await db.execute(text("SELECT 1"))
    assert result.scalar_one() == 1


async def test_vector_extension_present(db):
    result = await db.execute(
        text("SELECT count(*) FROM pg_extension WHERE extname = 'vector'")
    )
    assert result.scalar_one() == 1
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_db.py -v`
Expected: PASS (2 passed). Requires Postgres + `mc_test` DB from Task 3.

- [ ] **Step 6: Commit**

```bash
git add backend/app/db.py backend/app/models/__init__.py backend/tests/conftest.py backend/tests/test_db.py
git commit -m "feat(backend): add async db engine, session, and test harness"
```

---

### Task 5: AppUser model

**Files:**
- Create: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_user_model.py`

- [ ] **Step 1: Write `backend/app/models/user.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AppUser(Base):
    __tablename__ = "app_user"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 2: Replace `backend/app/models/__init__.py`**

```python
from app.models.user import AppUser  # noqa: F401
```

- [ ] **Step 3: Write the failing test**

`backend/tests/test_user_model.py`:

```python
from sqlalchemy import select

from app.models.user import AppUser


async def test_create_and_query_user(db):
    user = AppUser(email="g@example.com", name="G", password_hash="x")
    db.add(user)
    await db.flush()

    result = await db.execute(select(AppUser).where(AppUser.email == "g@example.com"))
    fetched = result.scalar_one()
    assert fetched.id is not None
    assert fetched.name == "G"
    assert fetched.settings == {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_user_model.py -v`
Expected: PASS (1 passed).

> If it fails with "relation app_user does not exist", the session-scoped `engine` fixture's `create_all` ran before `AppUser` registered. Confirm `app/models/__init__.py` imports `AppUser` and `conftest.py` imports `app.models`. Re-run.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/app/models/__init__.py backend/tests/test_user_model.py
git commit -m "feat(backend): add AppUser model"
```

---

### Task 6: Alembic setup + pgvector + app_user migrations

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/0001_enable_pgvector.py`
- Create: `backend/alembic/versions/0002_app_user.py`

- [ ] **Step 1: Create `backend/alembic.ini`**

```ini
[alembic]
script_location = alembic
prepend_sys_path = .

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

- [ ] **Step 2: Create `backend/alembic/script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 3: Create `backend/alembic/env.py`**

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

import app.models  # noqa: F401  (register models on metadata)
from app.config import settings
from app.db import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_offline():
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 4: Create `backend/alembic/versions/0001_enable_pgvector.py`**

```python
"""enable pgvector

Revision ID: 0001
Revises:
Create Date: 2026-05-29

"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
```

- [ ] **Step 5: Create `backend/alembic/versions/0002_app_user.py`**

```python
"""app_user table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-29

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_user",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("settings", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_app_user_email", "app_user", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_app_user_email", table_name="app_user")
    op.drop_table("app_user")
```

- [ ] **Step 6: Verify migrations apply to the dev database**

Run (from `backend/`):

```bash
uv run alembic upgrade head
uv run alembic current
```

Expected: upgrade runs 0001 then 0002 without error; `current` shows `0002 (head)`.

- [ ] **Step 7: Verify the table exists**

Run (from repo root): `docker compose exec postgres psql -U mc -d mc -c "\d app_user"`
Expected: shows the `app_user` table with the columns above.

- [ ] **Step 8: Commit**

```bash
git add backend/alembic.ini backend/alembic/
git commit -m "feat(backend): add alembic with pgvector and app_user migrations"
```

---

### Task 7: Password hashing

**Files:**
- Create: `backend/app/security.py`
- Test: `backend/tests/test_security.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_security.py`:

```python
from app.security import hash_password, verify_password


def test_hash_and_verify_roundtrip():
    h = hash_password("hunter2")
    assert h != "hunter2"
    assert verify_password("hunter2", h) is True


def test_verify_rejects_wrong_password():
    h = hash_password("hunter2")
    assert verify_password("wrong", h) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_security.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.security'`.

- [ ] **Step 3: Write `backend/app/security.py`**

```python
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_security.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/security.py backend/tests/test_security.py
git commit -m "feat(backend): add argon2 password hashing"
```

---

### Task 8: Auth service + schemas

**Files:**
- Create: `backend/app/services/__init__.py` (empty)
- Create: `backend/app/services/auth.py`
- Create: `backend/app/schemas/__init__.py` (empty)
- Create: `backend/app/schemas/auth.py`
- Test: `backend/tests/test_auth_service.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_auth_service.py`:

```python
from app.models.user import AppUser
from app.security import hash_password
from app.services.auth import authenticate_user, get_user_by_email


async def _make_user(db, email="g@example.com", password="hunter2"):
    user = AppUser(email=email, password_hash=hash_password(password))
    db.add(user)
    await db.flush()
    return user


async def test_get_user_by_email(db):
    await _make_user(db)
    found = await get_user_by_email(db, "g@example.com")
    assert found is not None
    assert found.email == "g@example.com"


async def test_authenticate_success(db):
    await _make_user(db)
    user = await authenticate_user(db, "g@example.com", "hunter2")
    assert user is not None


async def test_authenticate_wrong_password(db):
    await _make_user(db)
    user = await authenticate_user(db, "g@example.com", "nope")
    assert user is None


async def test_authenticate_unknown_email(db):
    user = await authenticate_user(db, "missing@example.com", "x")
    assert user is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_auth_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.auth'`.

- [ ] **Step 3: Create empty `backend/app/services/__init__.py` and `backend/app/schemas/__init__.py`**

- [ ] **Step 4: Write `backend/app/services/auth.py`**

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import AppUser
from app.security import verify_password


async def get_user_by_email(db: AsyncSession, email: str) -> AppUser | None:
    result = await db.execute(select(AppUser).where(AppUser.email == email))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> AppUser | None:
    user = await get_user_by_email(db, email)
    if user is None or user.password_hash is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
```

- [ ] **Step 5: Write `backend/app/schemas/auth.py`**

```python
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    name: str | None = None
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/test_auth_service.py -v`
Expected: PASS (4 passed).

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ backend/app/schemas/ backend/tests/test_auth_service.py
git commit -m "feat(backend): add auth service and schemas"
```

---

### Task 9: FastAPI app + health endpoint

**Files:**
- Create: `backend/app/api/__init__.py` (empty)
- Create: `backend/app/api/health.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_health.py`:

```python
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_health.py -v`
Expected: FAIL — `conftest.py` imports `app.main` inside the `client` fixture, which does not exist yet (ImportError).

- [ ] **Step 3: Create empty `backend/app/api/__init__.py`**

- [ ] **Step 4: Write `backend/app/api/health.py`**

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Write `backend/app/main.py`**

```python
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.api import health
from app.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="mission-control")
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        same_site="lax",
        https_only=settings.environment != "development",
    )
    app.include_router(health.router)
    return app


app = create_app()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/test_health.py -v`
Expected: PASS (1 passed).

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/__init__.py backend/app/api/health.py backend/app/main.py backend/tests/test_health.py
git commit -m "feat(backend): add FastAPI app and health endpoint"
```

---

### Task 10: Auth routes + session middleware

**Files:**
- Create: `backend/app/deps.py`
- Create: `backend/app/api/auth.py`
- Modify: `backend/app/main.py` (include the auth router)
- Test: `backend/tests/test_auth_api.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_auth_api.py`:

```python
from app.models.user import AppUser
from app.security import hash_password


async def _seed(db, email="g@example.com", password="hunter2"):
    db.add(AppUser(email=email, password_hash=hash_password(password)))
    await db.flush()


async def test_me_requires_auth(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_login_then_me(client, db):
    await _seed(db)
    login = await client.post("/auth/login", json={"email": "g@example.com", "password": "hunter2"})
    assert login.status_code == 200
    assert login.json()["email"] == "g@example.com"

    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "g@example.com"


async def test_login_bad_password(client, db):
    await _seed(db)
    resp = await client.post("/auth/login", json={"email": "g@example.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_logout_clears_session(client, db):
    await _seed(db)
    await client.post("/auth/login", json={"email": "g@example.com", "password": "hunter2"})
    logout = await client.post("/auth/logout")
    assert logout.status_code == 204
    me = await client.get("/auth/me")
    assert me.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_auth_api.py -v`
Expected: FAIL — `/auth/*` routes return 404 (router not added).

- [ ] **Step 3: Write `backend/app/deps.py`**

```python
import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.user import AppUser


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> AppUser:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = await db.get(AppUser, uuid.UUID(user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user
```

- [ ] **Step 4: Write `backend/app/api/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.user import AppUser
from app.schemas.auth import LoginRequest, UserOut
from app.services.auth import authenticate_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    request.session["user_id"] = str(user.id)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request) -> None:
    request.session.clear()


@router.get("/me", response_model=UserOut)
async def me(user: AppUser = Depends(get_current_user)) -> AppUser:
    return user
```

- [ ] **Step 5: Modify `backend/app/main.py` to include the auth router**

Change the imports and router section so the file reads:

```python
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.api import auth, health
from app.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="mission-control")
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        same_site="lax",
        https_only=settings.environment != "development",
    )
    app.include_router(health.router)
    app.include_router(auth.router)
    return app


app = create_app()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/test_auth_api.py -v`
Expected: PASS (4 passed).

- [ ] **Step 7: Run the full suite**

Run: `uv run pytest -v`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/deps.py backend/app/api/auth.py backend/app/main.py backend/tests/test_auth_api.py
git commit -m "feat(backend): add session auth routes (login/logout/me)"
```

---

### Task 11: Seed-user CLI

**Files:**
- Create: `backend/app/cli.py`
- Test: `backend/tests/test_cli.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_cli.py`:

```python
from app.cli import _seed_user
from app.services.auth import authenticate_user


async def test_seed_user_creates_and_is_authenticatable(db, engine):
    # _seed_user opens its own session via SessionLocal bound to the dev engine,
    # so for the test we call the inner coroutine with the test session directly.
    await _seed_user(db, "new@example.com", "secret", "New User")
    await db.flush()
    user = await authenticate_user(db, "new@example.com", "secret")
    assert user is not None
    assert user.name == "New User"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_cli.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.cli'`.

- [ ] **Step 3: Write `backend/app/cli.py`**

```python
import asyncio

import typer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models.user import AppUser
from app.security import hash_password
from app.services.auth import get_user_by_email

cli = typer.Typer(help="mission-control backend admin CLI")


async def _seed_user(db: AsyncSession, email: str, password: str, name: str | None) -> None:
    existing = await get_user_by_email(db, email)
    if existing is not None:
        existing.password_hash = hash_password(password)
        if name is not None:
            existing.name = name
    else:
        db.add(AppUser(email=email, name=name, password_hash=hash_password(password)))


async def _run_seed(email: str, password: str, name: str | None) -> None:
    async with SessionLocal() as db:
        await _seed_user(db, email, password, name)
        await db.commit()


@cli.command("seed-user")
def seed_user(
    email: str = typer.Option(..., help="User email"),
    password: str = typer.Option(..., help="User password"),
    name: str | None = typer.Option(None, help="Display name"),
) -> None:
    """Create or update the single application user."""
    asyncio.run(_run_seed(email, password, name))
    typer.echo(f"Seeded user {email}")


if __name__ == "__main__":
    cli()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_cli.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: Manually verify the CLI against the dev DB**

Run (from `backend/`, after `alembic upgrade head`):

```bash
uv run python -m app.cli seed-user --email g@example.com --password changeme --name G
```

Expected: prints `Seeded user g@example.com`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/cli.py backend/tests/test_cli.py
git commit -m "feat(backend): add seed-user CLI"
```

---

### Task 12: Lint, type-check, and CI

**Files:**
- Create: `.github/workflows/ci.yml` (repo root)

- [ ] **Step 1: Run lint and type-check locally, fix any findings**

Run (from `backend/`):

```bash
uv run ruff check . --fix
uv run ruff format .
uv run mypy app
```

Expected: ruff clean; mypy reports no errors. Fix anything reported, then re-run until clean.

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: mc
          POSTGRES_PASSWORD: mc
          POSTGRES_DB: mc
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U mc"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql+asyncpg://mc:mc@localhost:5432/mc
      TEST_DATABASE_URL: postgresql+asyncpg://mc:mc@localhost:5432/mc_test
      SESSION_SECRET: ci-secret
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - name: Install uv
        uses: astral-sh/setup-uv@v5
        with:
          python-version: "3.12"
      - name: Sync deps
        run: uv sync
      - name: Create test database
        run: PGPASSWORD=mc psql -h localhost -U mc -d mc -c "CREATE DATABASE mc_test;" || true
      - name: Migrate dev database
        run: uv run alembic upgrade head
      - name: Lint
        run: uv run ruff check .
      - name: Type check
        run: uv run mypy app
      - name: Test
        run: uv run pytest -v
```

- [ ] **Step 3: Verify the workflow is valid locally (optional)**

Run: `uv run python -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('../.github/workflows/ci.yml').read_text()); print('yaml ok')"`
Expected: `yaml ok`.

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml backend/
git commit -m "ci: add backend lint, type-check, and test workflow"
```

> Push only when the user asks. If a GitHub remote exists, the workflow runs on push/PR and must be green to consider P0.1 done.

---

## Self-Review

**Spec coverage (against P0 backend portions):**
- FastAPI skeleton → Task 9 ✓
- SQLAlchemy/Alembic → Tasks 4, 6 ✓
- pydantic-settings → Task 2 ✓
- pgvector enabled → Task 6 (migration 0001) ✓
- Health endpoint → Task 9 ✓
- Single-user auth + session → Tasks 7, 8, 10 ✓
- Seed the single user (per spec §13) → Task 11 ✓
- CI green → Task 12 ✓
- Postgres via Docker → Task 3 ✓
- *Deferred to follow-on plans (explicitly out of this plan's scope):* TanStack frontend shell, Neo4j, worker, Caddy/TLS, full multi-service Compose. These are named in the plan header.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has expected output. ✓

**Type consistency:** `get_db`, `get_current_user`, `authenticate_user`, `get_user_by_email`, `hash_password`, `verify_password`, `_seed_user(db, email, password, name)`, `AppUser`, `LoginRequest`, `UserOut`, `settings`, `Base`, `SessionLocal`, `create_app` — names and signatures are consistent across all tasks. The `client`/`db`/`engine` fixtures defined in Task 4's `conftest.py` are used consistently in Tasks 5, 8, 9, 10, 11. ✓

**Known fragility flagged for the executor:** pytest-asyncio session-scoped async fixtures rely on `loop_scope="session"` and `asyncio_default_fixture_loop_scope = "session"` (set in Task 1). If the installed pytest-asyncio version errors on `loop_scope`, pin `pytest-asyncio>=0.24` and keep the config as written.
