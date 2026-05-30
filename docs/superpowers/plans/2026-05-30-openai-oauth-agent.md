# OpenAI OAuth Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anthropic agent provider with an `openai_oauth` provider that bills model calls to G's ChatGPT subscription via the Codex "Sign in with ChatGPT" device-code OAuth flow, with tokens stored in Postgres and a CLI command to authenticate.

**Architecture:** New `oauth_credential` table + `token_store`. New `openai_auth.py` (device-code flow, JWT decode, refresh, the Responses HTTP client) using an injectable `httpx.AsyncClient` so everything is testable with `httpx.MockTransport` (no network). The pluggable `app/agent/llm.py` loses `anthropic`, gains `openai_oauth` (calls `chatgpt.com/backend-api/codex/responses`); `mock` stays for tests. A `auth-openai` CLI command runs the device flow.

**Tech Stack:** Python 3.12, FastAPI, async SQLAlchemy, Alembic, httpx, Typer (CLI), pytest.

**Source of truth:** `docs/superpowers/specs/2026-05-30-openai-oauth-agent-design.md`. Run backend cmds from `backend/`. Branch `feat/openai-oauth-agent`. No AI/Claude attribution in commits.

**Reverse-engineering caveat (read once):** OpenAI does not document this flow. The endpoint paths, `originator`/User-Agent, and the Responses-stream event schema below are best-known values; the code is complete and unit-tested via mock transports, but their *real-world correctness* is confirmed in the **live smoke (Task 6)**, where you tune them against your real ChatGPT account. Keep them as `settings` so tuning is a config edit, not a code change.

---

### Task 1: `oauth_credential` table + token store

**Files:**
- Create: `backend/app/models/oauth_credential.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/0018_oauth_credential.py`
- Create: `backend/app/agent/token_store.py`
- Test: `backend/tests/test_oauth_token_store.py`

- [ ] **Step 1: Model `backend/app/models/oauth_credential.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OAuthCredential(Base):
    __tablename__ = "oauth_credential"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String, unique=True, index=True)
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str] = mapped_column(Text)
    id_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_id: Mapped[str | None] = mapped_column(String, nullable=True)
    plan_type: Mapped[str | None] = mapped_column(String, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

- [ ] **Step 2:** Add `from app.models.oauth_credential import OAuthCredential  # noqa: F401` to `backend/app/models/__init__.py` (keep alphabetical with the others).

- [ ] **Step 3: Migration `backend/alembic/versions/0018_oauth_credential.py`** (`revision="0018"`, `down_revision="0017"`)

```python
"""oauth_credential table

Revision ID: 0018
Revises: 0017
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oauth_credential",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("id_token", sa.Text(), nullable=True),
        sa.Column("account_id", sa.String(), nullable=True),
        sa.Column("plan_type", sa.String(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_oauth_credential_provider", "oauth_credential", ["provider"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_oauth_credential_provider", table_name="oauth_credential")
    op.drop_table("oauth_credential")
```

- [ ] **Step 4: `backend/app/agent/token_store.py`**

```python
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.oauth_credential import OAuthCredential


async def get_credential(db: AsyncSession, provider: str = "openai") -> OAuthCredential | None:
    result = await db.execute(
        select(OAuthCredential).where(OAuthCredential.provider == provider)
    )
    return result.scalar_one_or_none()


async def upsert_credential(
    db: AsyncSession,
    provider: str = "openai",
    *,
    access_token: str,
    refresh_token: str,
    id_token: str | None = None,
    account_id: str | None = None,
    plan_type: str | None = None,
    expires_at: datetime | None = None,
) -> OAuthCredential:
    cred = await get_credential(db, provider)
    if cred is None:
        cred = OAuthCredential(provider=provider)
        db.add(cred)
    cred.access_token = access_token
    cred.refresh_token = refresh_token
    cred.id_token = id_token
    cred.account_id = account_id
    cred.plan_type = plan_type
    cred.expires_at = expires_at
    await db.flush()
    return cred
```

- [ ] **Step 5: Write the failing test `backend/tests/test_oauth_token_store.py`**

```python
from datetime import UTC, datetime

from app.agent.token_store import get_credential, upsert_credential


async def test_upsert_then_get(db):
    assert await get_credential(db, "openai") is None
    exp = datetime(2026, 6, 1, tzinfo=UTC)
    await upsert_credential(
        db, "openai", access_token="a", refresh_token="r", account_id="acc_1", expires_at=exp
    )
    cred = await get_credential(db, "openai")
    assert cred is not None
    assert cred.access_token == "a"
    assert cred.account_id == "acc_1"


async def test_upsert_is_idempotent_single_row(db):
    await upsert_credential(db, "openai", access_token="a1", refresh_token="r1")
    await upsert_credential(db, "openai", access_token="a2", refresh_token="r2")
    cred = await get_credential(db, "openai")
    assert cred.access_token == "a2"
    from sqlalchemy import func, select

    from app.models.oauth_credential import OAuthCredential

    count = (await db.execute(select(func.count()).select_from(OAuthCredential))).scalar_one()
    assert count == 1
```

- [ ] **Step 6: Run** `uv run pytest tests/test_oauth_token_store.py -v` (PASS), then `uv run alembic upgrade head` (→ `0018`).

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/oauth_credential.py backend/app/models/__init__.py backend/alembic/versions/0018_oauth_credential.py backend/app/agent/token_store.py backend/tests/test_oauth_token_store.py
git commit -m "feat(backend): oauth_credential table + token store"
```

---

### Task 2: OAuth device-code flow, JWT decode, refresh (`openai_auth.py` part 1)

**Files:**
- Create: `backend/app/agent/openai_auth.py`
- Modify: `backend/app/config.py`
- Test: `backend/tests/test_openai_auth.py`

- [ ] **Step 1: Config (`backend/app/config.py`)** — REMOVE `anthropic_api_key` and ADD:

```python
    llm_model: str = "gpt-5"  # a ChatGPT/Codex model id; confirm in the live smoke
    openai_oauth_client_id: str = "app_EMoamEEZ73f0CkXaXp7hrann"
    openai_auth_base_url: str = "https://auth.openai.com"
    openai_responses_url: str = "https://chatgpt.com/backend-api/codex/responses"
    openai_originator: str = "codex_cli_rs"  # confirm in the live smoke
    openai_user_agent: str = "mission-control-agent/0.1"  # confirm in the live smoke
```

(Keep the existing `llm_provider: str = "mock"`. The `llm_model` default may already exist — replace its value.)

- [ ] **Step 2: `backend/app/agent/openai_auth.py`** (device flow + JWT + refresh; the Responses client is added in Task 3)

```python
import asyncio
import base64
import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.token_store import get_credential, upsert_credential
from app.config import settings

_SCOPE = "openid profile email offline_access"


@dataclass
class DeviceCode:
    device_code: str
    user_code: str
    verification_uri: str
    interval: int
    expires_in: int


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str
    id_token: str | None
    account_id: str | None
    expires_at: datetime | None
    plan_type: str | None


def _decode_jwt_claims(token: str) -> dict:
    """Decode a JWT payload WITHOUT verification (we only read our own token's claims)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


def account_id_and_expiry(access_token: str) -> tuple[str | None, datetime | None]:
    claims = _decode_jwt_claims(access_token)
    auth = claims.get("https://api.openai.com/auth", {}) or {}
    account_id = auth.get("chatgpt_account_id")
    exp = claims.get("exp")
    expires_at = datetime.fromtimestamp(exp, tz=UTC) if exp else None
    return account_id, expires_at


def _token_set(data: dict, *, fallback_refresh: str = "") -> TokenSet:
    access = data["access_token"]
    account_id, expires_at = account_id_and_expiry(access)
    return TokenSet(
        access_token=access,
        refresh_token=data.get("refresh_token") or fallback_refresh,
        id_token=data.get("id_token"),
        account_id=account_id,
        expires_at=expires_at,
        plan_type=data.get("chatgpt_plan_type"),
    )


async def request_device_code(http: httpx.AsyncClient) -> DeviceCode:
    # NOTE: confirm the exact device-authorization path against the Codex source in the live smoke.
    resp = await http.post(
        f"{settings.openai_auth_base_url}/oauth/device/code",
        data={"client_id": settings.openai_oauth_client_id, "scope": _SCOPE},
    )
    resp.raise_for_status()
    d = resp.json()
    return DeviceCode(
        device_code=d["device_code"],
        user_code=d["user_code"],
        verification_uri=(
            d.get("verification_uri_complete")
            or d.get("verification_uri")
            or f"{settings.openai_auth_base_url}/device"
        ),
        interval=int(d.get("interval", 5)),
        expires_in=int(d.get("expires_in", 900)),
    )


async def poll_for_token(
    http: httpx.AsyncClient,
    device: DeviceCode,
    *,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    now: Callable[[], float] = time.monotonic,
) -> TokenSet:
    deadline = now() + device.expires_in
    interval = device.interval
    while now() < deadline:
        resp = await http.post(
            f"{settings.openai_auth_base_url}/oauth/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": device.device_code,
                "client_id": settings.openai_oauth_client_id,
            },
        )
        if resp.status_code == 200:
            return _token_set(resp.json())
        err = (resp.json() or {}).get("error") if resp.content else None
        if err == "authorization_pending":
            pass
        elif err == "slow_down":
            interval += 5
        elif err in ("expired_token", "access_denied"):
            raise RuntimeError(f"Device authorization failed: {err}")
        else:
            resp.raise_for_status()
        await sleep(interval)
    raise RuntimeError("Device authorization timed out")


async def refresh(http: httpx.AsyncClient, refresh_token: str) -> TokenSet:
    resp = await http.post(
        f"{settings.openai_auth_base_url}/oauth/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": settings.openai_oauth_client_id,
        },
    )
    resp.raise_for_status()
    return _token_set(resp.json(), fallback_refresh=refresh_token)


async def ensure_fresh(
    db: AsyncSession, http: httpx.AsyncClient, *, margin: int = 60
) -> tuple[str, str | None]:
    cred = await get_credential(db, "openai")
    if cred is None:
        raise RuntimeError("No OpenAI credential. Run: python -m app.cli auth-openai")
    if cred.expires_at is None or cred.expires_at <= datetime.now(UTC) + timedelta(seconds=margin):
        ts = await refresh(http, cred.refresh_token)
        cred = await upsert_credential(
            db,
            "openai",
            access_token=ts.access_token,
            refresh_token=ts.refresh_token,
            id_token=ts.id_token,
            account_id=ts.account_id,
            plan_type=ts.plan_type,
            expires_at=ts.expires_at,
        )
    return cred.access_token, cred.account_id
```

- [ ] **Step 3: Test `backend/tests/test_openai_auth.py`** (no network — `httpx.MockTransport`)

```python
import base64
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.agent import openai_auth
from app.agent.openai_auth import (
    account_id_and_expiry,
    ensure_fresh,
    poll_for_token,
    request_device_code,
)
from app.agent.token_store import upsert_credential


def _jwt(claims: dict) -> str:
    def seg(d: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

    return f"{seg({'alg': 'none'})}.{seg(claims)}.sig"


def test_account_id_and_expiry_from_jwt():
    exp = int((datetime.now(UTC) + timedelta(hours=1)).timestamp())
    token = _jwt({"https://api.openai.com/auth": {"chatgpt_account_id": "acc_42"}, "exp": exp})
    account_id, expires_at = account_id_and_expiry(token)
    assert account_id == "acc_42"
    assert expires_at is not None


async def test_request_device_code_parses_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "device_code": "DEV",
                "user_code": "ABCD-1234",
                "verification_uri": "https://auth.openai.com/device",
                "interval": 5,
                "expires_in": 900,
            },
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    dc = await request_device_code(http)
    assert dc.device_code == "DEV"
    assert dc.user_code == "ABCD-1234"


async def test_poll_for_token_handles_pending_then_success():
    calls = {"n": 0}
    access = _jwt(
        {
            "https://api.openai.com/auth": {"chatgpt_account_id": "acc_9"},
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 2:
            return httpx.Response(400, json={"error": "authorization_pending"})
        return httpx.Response(200, json={"access_token": access, "refresh_token": "R"})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    dc = openai_auth.DeviceCode("DEV", "ABCD-1234", "uri", interval=0, expires_in=30)

    async def no_sleep(_):
        return None

    ts = await poll_for_token(http, dc, sleep=no_sleep)
    assert ts.account_id == "acc_9"
    assert ts.refresh_token == "R"


async def test_ensure_fresh_refreshes_when_expired(db):
    new_access = _jwt(
        {
            "https://api.openai.com/auth": {"chatgpt_account_id": "acc_new"},
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"access_token": new_access, "refresh_token": "R2"})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await upsert_credential(
        db,
        "openai",
        access_token="old",
        refresh_token="R1",
        account_id="acc_old",
        expires_at=datetime.now(UTC) - timedelta(minutes=5),  # expired
    )
    access, account_id = await ensure_fresh(db, http)
    assert account_id == "acc_new"
    assert access == new_access


async def test_ensure_fresh_raises_without_credential(db):
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})))
    with pytest.raises(RuntimeError, match="auth-openai"):
        await ensure_fresh(db, http)
```

- [ ] **Step 4: Run** `uv run pytest tests/test_openai_auth.py -v` → all pass (fix imports if needed; ensure `httpx` is a dependency — it is, via the test deps / add to `[project].dependencies` if the app imports it: add `"httpx>=0.28"` to `backend/pyproject.toml` dependencies and `uv sync`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/agent/openai_auth.py backend/app/config.py backend/tests/test_openai_auth.py backend/pyproject.toml backend/uv.lock
git commit -m "feat(backend): OpenAI device-code OAuth (request/poll/refresh) + JWT account-id"
```

---

### Task 3: Responses client + `openai_oauth` LLM provider (remove Anthropic)

**Files:**
- Modify: `backend/app/agent/openai_auth.py` (add the Responses streaming call)
- Modify: `backend/app/agent/llm.py` (remove anthropic; add `openai_oauth`; `complete()` takes `db`)
- Modify: `backend/app/agent/agent.py` (pass `db` into `complete()`)
- Test: `backend/tests/test_openai_oauth_provider.py`

- [ ] **Step 1: Add to `backend/app/agent/openai_auth.py`** a streaming Responses call + a high-level helper that returns assembled output:

```python
def _responses_headers(access_token: str, account_id: str | None) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "chatgpt-account-id": account_id or "",
        "OpenAI-Beta": "responses=experimental",
        "originator": settings.openai_originator,
        "User-Agent": settings.openai_user_agent,
        "accept": "text/event-stream",
        "content-type": "application/json",
    }


async def responses_events(
    http: httpx.AsyncClient, access_token: str, account_id: str | None, body: dict
):
    """Yield parsed JSON events from the Responses SSE stream."""
    async with http.stream(
        "POST", settings.openai_responses_url, headers=_responses_headers(access_token, account_id), json=body
    ) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                yield json.loads(data)
            except json.JSONDecodeError:
                continue
```

- [ ] **Step 2: Rewrite `backend/app/agent/llm.py`** — keep `ToolCall`/`LLMTurn`/`_mock_complete`/`complete` (mock branch unchanged), REMOVE `_anthropic_complete`, ADD the OpenAI provider. `complete()` gains a `db` param:

```python
# (keep the existing imports + ToolCall, LLMTurn dataclasses + _mock_complete)
import json as _json

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import openai_auth
from app.config import settings

_http_singleton: "httpx.AsyncClient | None" = None


def _http() -> "httpx.AsyncClient":
    global _http_singleton
    import httpx
    if _http_singleton is None:
        _http_singleton = httpx.AsyncClient(timeout=120)
    return _http_singleton


def _to_responses_input(messages: list[dict]) -> list[dict]:
    """Map our generic messages to Responses API `input` items."""
    items: list[dict] = []
    for m in messages:
        role = m.get("role", "user")
        if role == "tool":
            items.append(
                {
                    "type": "function_call_output",
                    "call_id": m.get("tool_call_id", ""),
                    "output": m.get("content")
                    if isinstance(m.get("content"), str)
                    else _json.dumps(m.get("content")),
                }
            )
        else:
            content = m.get("content")
            text = content if isinstance(content, str) else _json.dumps(content)
            items.append({"role": role, "content": [{"type": "input_text", "text": text}]})
    return items


def _to_responses_tools(tools: list[dict]) -> list[dict]:
    return [
        {
            "type": "function",
            "name": t["name"],
            "description": t.get("description", ""),
            "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
        }
        for t in tools
    ]


def _assemble_turn(events: list[dict]) -> LLMTurn:
    """Assemble a Responses SSE event list into an LLMTurn.
    Text is collected from output_text deltas; tool calls from completed function_call items.
    NOTE: confirm the exact event `type` strings in the live smoke and adjust if needed."""
    text_parts: list[str] = []
    tool_calls: list[ToolCall] = []
    fn_args: dict[str, str] = {}
    fn_meta: dict[str, dict] = {}
    for ev in events:
        etype = ev.get("type", "")
        if etype.endswith("output_text.delta"):
            text_parts.append(ev.get("delta", ""))
        elif etype.endswith("output_item.added") or etype.endswith("output_item.done"):
            item = ev.get("item", {})
            if item.get("type") == "function_call":
                cid = item.get("call_id") or item.get("id", "")
                fn_meta[cid] = item
                if item.get("arguments"):
                    fn_args[cid] = item["arguments"]
        elif etype.endswith("function_call_arguments.delta"):
            cid = ev.get("item_id", "")
            fn_args[cid] = fn_args.get(cid, "") + ev.get("delta", "")
        elif etype.endswith("function_call_arguments.done"):
            cid = ev.get("item_id", "")
            if "arguments" in ev:
                fn_args[cid] = ev["arguments"]
    for cid, item in fn_meta.items():
        try:
            args = _json.loads(fn_args.get(cid, "") or "{}")
        except _json.JSONDecodeError:
            args = {}
        tool_calls.append(ToolCall(id=cid, name=item.get("name", ""), input=args))
    text = "".join(text_parts).strip()
    return LLMTurn(text=text or None, tool_calls=tool_calls)


async def _openai_oauth_complete(
    db: AsyncSession, messages: list[dict], tools: list[dict], system: str
) -> LLMTurn:
    http = _http()
    access_token, account_id = await openai_auth.ensure_fresh(db, http)
    body = {
        "model": settings.llm_model,
        "instructions": system,
        "input": _to_responses_input(messages),
        "tools": _to_responses_tools(tools),
        "stream": True,
    }
    import httpx
    try:
        events = [ev async for ev in openai_auth.responses_events(http, access_token, account_id, body)]
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:  # refresh once + retry
            access_token, account_id = await openai_auth.ensure_fresh(db, http, margin=10**9)
            events = [
                ev async for ev in openai_auth.responses_events(http, access_token, account_id, body)
            ]
        else:
            raise
    return _assemble_turn(events)


async def complete(
    messages: list[dict], tools: list[dict], system: str, db: AsyncSession | None = None
) -> LLMTurn:
    if settings.llm_provider == "openai_oauth":
        if db is None:
            raise RuntimeError("openai_oauth provider requires a db session")
        return await _openai_oauth_complete(db, messages, tools, system)
    return _mock_complete(messages, tools, system)
```

(Adjust the existing `_mock_complete` signature/usage to match; keep its behavior identical. Remove any `anthropic` import.)

- [ ] **Step 2b: `backend/app/agent/agent.py`** — pass `db` into `complete`: change the call site `await complete(messages, tool_specs_for_llm(), system)` to `await complete(messages, tool_specs_for_llm(), system, db=db)`.

- [ ] **Step 3: Test `backend/tests/test_openai_oauth_provider.py`** — feed a recorded SSE stream via `httpx.MockTransport`, with `llm_provider="openai_oauth"`, and assert the assembled `LLMTurn`.

```python
import base64
import json
from datetime import UTC, datetime, timedelta

import httpx

from app.agent import llm
from app.agent.token_store import upsert_credential


def _jwt(account_id: str) -> str:
    def seg(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

    exp = int((datetime.now(UTC) + timedelta(hours=1)).timestamp())
    return f"{seg({'alg': 'none'})}.{seg({'https://api.openai.com/auth': {'chatgpt_account_id': account_id}, 'exp': exp})}.s"


def _sse(events: list[dict]) -> bytes:
    return ("".join(f"data: {json.dumps(e)}\n\n" for e in events) + "data: [DONE]\n\n").encode()


def _client_returning(stream_bytes: bytes) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=stream_bytes, headers={"content-type": "text/event-stream"})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_assemble_text_turn():
    events = [
        {"type": "response.output_text.delta", "delta": "Hello "},
        {"type": "response.output_text.delta", "delta": "world"},
        {"type": "response.completed"},
    ]
    turn = llm._assemble_turn(events)
    assert turn.text == "Hello world"
    assert turn.tool_calls == []


def test_assemble_tool_call_turn():
    events = [
        {
            "type": "response.output_item.done",
            "item": {
                "type": "function_call",
                "call_id": "c1",
                "name": "create_task",
                "arguments": json.dumps({"title": "Email Bob"}),
            },
        },
        {"type": "response.completed"},
    ]
    turn = llm._assemble_turn(events)
    assert len(turn.tool_calls) == 1
    assert turn.tool_calls[0].name == "create_task"
    assert turn.tool_calls[0].input == {"title": "Email Bob"}


async def test_openai_oauth_complete_end_to_end(db, monkeypatch):
    monkeypatch.setattr(llm.settings, "llm_provider", "openai_oauth")
    await upsert_credential(
        db, "openai", access_token=_jwt("acc_1"), refresh_token="R",
        account_id="acc_1", expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    stream = _sse([{"type": "response.output_text.delta", "delta": "Done."}, {"type": "response.completed"}])
    monkeypatch.setattr(llm, "_http", lambda: _client_returning(stream))
    turn = await llm.complete([{"role": "user", "content": "hi"}], [], "sys", db=db)
    assert turn.text == "Done."
```

- [ ] **Step 4: Run** `uv run pytest tests/test_openai_oauth_provider.py -v` (PASS). Then run the FULL suite `uv run pytest -v` — the existing agent tests still use `mock` and must stay green (the `complete()` call now passes `db=db`, which `mock` ignores). Then `uv run ruff check . && uv run mypy app`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/agent/openai_auth.py backend/app/agent/llm.py backend/app/agent/agent.py backend/tests/test_openai_oauth_provider.py
git commit -m "feat(backend): openai_oauth LLM provider via Codex Responses endpoint; drop Anthropic"
```

---

### Task 4: `auth-openai` CLI command

**Files:**
- Modify: `backend/app/cli.py`
- Test: `backend/tests/test_auth_openai_cli.py`

- [ ] **Step 1: Add to `backend/app/cli.py`** an `auth-openai` command + a `--status` flag. Reuse `SessionLocal`. The interactive device flow:

```python
import httpx

from app.agent.openai_auth import poll_for_token, request_device_code, account_id_and_expiry
from app.agent.token_store import get_credential, upsert_credential


async def _auth_openai() -> None:
    async with httpx.AsyncClient(timeout=120) as http, SessionLocal() as db:
        device = await request_device_code(http)
        typer.echo(f"\nTo authorize mission-control with your ChatGPT account:")
        typer.echo(f"  1. Open: {device.verification_uri}")
        typer.echo(f"  2. Enter code: {device.user_code}\n")
        typer.echo("Waiting for approval… (Ctrl-C to cancel)")
        tokens = await poll_for_token(http, device)
        await upsert_credential(
            db,
            "openai",
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            id_token=tokens.id_token,
            account_id=tokens.account_id,
            plan_type=tokens.plan_type,
            expires_at=tokens.expires_at,
        )
        await db.commit()
        typer.echo(f"Authorized. account_id={tokens.account_id} plan={tokens.plan_type}")


@cli.command("auth-openai")
def auth_openai() -> None:
    """Authenticate mission-control with your ChatGPT subscription (device-code OAuth)."""
    asyncio.run(_auth_openai())


async def _auth_status() -> None:
    async with SessionLocal() as db:
        cred = await get_credential(db, "openai")
        if cred is None:
            typer.echo("No OpenAI credential stored. Run: python -m app.cli auth-openai")
        else:
            typer.echo(f"OpenAI authorized: account_id={cred.account_id} expires_at={cred.expires_at}")


@cli.command("auth-status")
def auth_status() -> None:
    """Show the stored OpenAI credential status."""
    asyncio.run(_auth_status())
```

(Use the existing `cli`, `SessionLocal`, `asyncio`, `typer` imports already in `cli.py`.)

- [ ] **Step 2: Test `backend/tests/test_auth_openai_cli.py`** — test the inner `_auth_openai` coroutine by monkeypatching `request_device_code`/`poll_for_token` and asserting a credential is stored. (The Typer command wraps `asyncio.run`; test the coroutine with the `db` fixture by patching `SessionLocal` to yield the test session.)

```python
import base64
import json
from datetime import UTC, datetime, timedelta

from app.agent import openai_auth
from app.agent.openai_auth import DeviceCode, TokenSet
from app.agent.token_store import get_credential


def _jwt(acc):
    def seg(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

    return f"x.{seg({'https://api.openai.com/auth': {'chatgpt_account_id': acc}})}.s"


async def test_auth_openai_stores_credential(db, monkeypatch):
    from app import cli

    async def fake_device(http):
        return DeviceCode("DEV", "ABCD-1234", "https://auth.openai.com/device", 0, 30)

    async def fake_poll(http, device, **kw):
        return TokenSet(
            access_token=_jwt("acc_cli"), refresh_token="R", id_token=None,
            account_id="acc_cli", expires_at=datetime.now(UTC) + timedelta(hours=1), plan_type="plus",
        )

    monkeypatch.setattr(cli, "request_device_code", fake_device)
    monkeypatch.setattr(cli, "poll_for_token", fake_poll)

    # Patch SessionLocal so the command uses the test session (no commit isolation break:
    # use the db fixture's bind). Simplest: monkeypatch cli.SessionLocal to a factory returning db.
    class _CM:
        async def __aenter__(self_):
            return db

        async def __aexit__(self_, *a):
            return False

    monkeypatch.setattr(cli, "SessionLocal", lambda: _CM())
    # avoid real network client
    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: _CM())
    # db.commit() inside _auth_openai must not break the savepoint fixture — patch it to flush
    monkeypatch.setattr(db, "commit", db.flush)

    await cli._auth_openai()
    cred = await get_credential(db, "openai")
    assert cred is not None
    assert cred.account_id == "acc_cli"
```

(If patching `SessionLocal`/`httpx.AsyncClient`/`db.commit` proves awkward with the savepoint fixture, instead refactor `_auth_openai` to accept injected `http` and `db` params and test that inner function directly — this is the cleaner design; prefer it.)

- [ ] **Step 3: Run** `uv run pytest tests/test_auth_openai_cli.py -v` (PASS). Manually confirm the command is registered: `uv run python -m app.cli --help` lists `auth-openai` and `auth-status`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/cli.py backend/tests/test_auth_openai_cli.py
git commit -m "feat(backend): auth-openai + auth-status CLI commands"
```

---

### Task 5: Full gate + remove residual Anthropic references

**Files:** various (cleanup)

- [ ] **Step 1: Remove residual Anthropic references** — grep for `anthropic` across `backend/`: `grep -ri anthropic backend/app backend/tests`. Remove the `anthropic_api_key` config (done in Task 2), any leftover import/branch in `llm.py`, and update the `pyproject.toml` description if it still says Anthropic. (`docs/SPEC.md` already describes the agent; update §10 if it mentions Anthropic as the provider — change to "OpenAI via ChatGPT-subscription OAuth".)

- [ ] **Step 2: Full backend gate**

Run (from `backend/`):
```bash
uv run pytest -v
uv run ruff check .
uv run mypy app
uv run alembic upgrade head   # → 0018
```
Expected: all green; head `0018`. Fix anything.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(backend): remove residual Anthropic refs; gate green for openai_oauth"
```

---

### Task 6: Live smoke (CONTROLLER / G runs — confirms the reverse-engineered bits)

This is run by the controller with G present (it needs a real ChatGPT login). It is NOT a unit test.

- [ ] **Step 1:** Ensure the dev DB is migrated (`uv run alembic upgrade head`).
- [ ] **Step 2:** Run `uv run python -m app.cli auth-openai`. It prints a URL + code. **G opens the URL, signs in with their ChatGPT account, enters the code.** The command should print `Authorized. account_id=…`. If `request_device_code` 404s or the response shape differs, adjust the device endpoint path / fields in `openai_auth.py` (this is the expected reverse-engineering step — compare against the openai/codex source or tumf/opencode-openai-device-auth).
- [ ] **Step 3:** `uv run python -m app.cli auth-status` shows the credential.
- [ ] **Step 4:** Start the backend with `LLM_PROVIDER=openai_oauth` (and the seeded user). `POST /agent/chat {"message":"create a task to prepare the Q3 board update"}`. Confirm: a real model reply comes back, a task is created (tool-calling honored), and the token refreshed transparently if needed. If the Responses endpoint rejects custom tools or the event `type` strings differ, tune `_assemble_turn`, `originator`, `openai_user_agent`, and `llm_model` until it works — these are the values flagged for live confirmation.
- [ ] **Step 5:** Record the working values (model id, originator, UA, device endpoint, event schema) back into `config.py` / `_assemble_turn` and commit: `git commit -m "fix(backend): tune openai_oauth values confirmed against live ChatGPT account"`.

---

## Self-Review

**Spec coverage:** oauth_credential table + store → Task 1 ✓; device-code flow + JWT + refresh + ensure_fresh → Task 2 ✓; Responses client + `openai_oauth` provider + drop Anthropic + thread `db` → Task 3 ✓; CLI `auth-openai`/`auth-status` → Task 4 ✓; config changes → Tasks 2,5 ✓; testing strategy (mock transport + recorded SSE + live smoke) → Tasks 2,3,6 ✓; risks/fallback isolation → preserved (everything behind the `LLMProvider`/`settings` boundary). Embeddings out-of-scope (unchanged) — correctly not in any task.

**Placeholder scan:** Code is complete and runnable. The values flagged "confirm in live smoke" (device endpoint path, `originator`, UA, `llm_model`, Responses event `type` strings) are reverse-engineering unknowns made into `settings`/isolated functions and verified in Task 6 — not vague TODOs. The Task 4 test notes a cleaner alternative (inject http/db) — prefer it if the monkeypatching is awkward.

**Type/name consistency:** `DeviceCode`, `TokenSet`, `request_device_code`, `poll_for_token`, `refresh`, `ensure_fresh`, `account_id_and_expiry`, `responses_events`, `_assemble_turn`, `_openai_oauth_complete`, `complete(..., db=None)`, `get_credential`/`upsert_credential`, `OAuthCredential`, provider string `"openai_oauth"`, migration `0018` — consistent across tasks. `complete()`'s new `db` param is threaded from `agent.py` (Task 3 Step 2b).

**Known fragility:** the whole feature reverse-engineers an undocumented OpenAI flow; Task 6 is where it's validated against reality. The unit tests prove the *mechanics* (parsing, polling, refresh, assembly) independent of the exact endpoints.
