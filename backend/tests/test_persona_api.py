"""Integration tests for /agent/persona GET / PUT / reset + audit recording."""
import pytest
from sqlalchemy import select

from app.agent.persona_store import DEFAULT_PERSONA, get_persona
from app.models.audit import AuditLog
from tests.helpers import login


@pytest.mark.asyncio(loop_scope="session")
async def test_get_persona_returns_default_when_absent(client, db):
    await login(client, db, email="persona-get@example.com", password="pw")

    resp = await client.get("/agent/persona")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == DEFAULT_PERSONA.name
    assert body["is_default"] is True


@pytest.mark.asyncio(loop_scope="session")
async def test_put_persona_persists_and_records_audit(client, db):
    await login(client, db, email="persona-put@example.com", password="pw")

    resp = await client.put(
        "/agent/persona",
        json={"name": "Nova", "role": "chief of staff", "tone": "warm", "greeting": "Yo G"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Nova"
    assert body["role"] == "chief of staff"
    assert body["greeting"] == "Yo G"
    assert body["is_default"] is False

    # Persisted in DB
    db.expire_all()
    persona = await get_persona(db)
    assert persona is not None
    assert persona.name == "Nova"

    # Audit row recorded through the write-path
    stmt = select(AuditLog).where(AuditLog.entity_type == "agent_persona")
    audit_rows = list((await db.execute(stmt)).scalars().all())
    assert len(audit_rows) >= 1
    assert audit_rows[0].surface == "ui"


@pytest.mark.asyncio(loop_scope="session")
async def test_put_then_update_keeps_single_row(client, db):
    await login(client, db, email="persona-upd@example.com", password="pw")

    await client.put("/agent/persona", json={"name": "First"})
    resp = await client.put("/agent/persona", json={"name": "Second"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Second"

    from sqlalchemy import func

    from app.models.agent_persona import AgentPersona

    db.expire_all()
    count = (await db.execute(select(func.count()).select_from(AgentPersona))).scalar_one()
    assert count == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_reset_persona_restores_default(client, db):
    await login(client, db, email="persona-reset@example.com", password="pw")

    await client.put("/agent/persona", json={"name": "Nova", "role": "custom", "tone": "spicy"})
    resp = await client.post("/agent/persona/reset")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == DEFAULT_PERSONA.name
    assert body["role"] is None
    assert body["tone"] is None
    assert body["enabled"] is True


@pytest.mark.asyncio(loop_scope="session")
async def test_persona_requires_auth(client):
    resp = await client.get("/agent/persona")
    assert resp.status_code in (401, 403)
