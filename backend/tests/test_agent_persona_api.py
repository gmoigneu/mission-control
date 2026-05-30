"""Integration tests for /agent/persona get/put/reset + audit recording."""
import pytest
from sqlalchemy import select

from app.models.audit import AuditLog
from tests.helpers import login


@pytest.mark.asyncio(loop_scope="session")
async def test_get_persona_returns_defaults_when_unset(client, db):
    await login(client, db, email="persona-get@example.com", password="pw")

    resp = await client.get("/agent/persona")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Aya"
    assert body["enabled"] is True
    # Preview is the composed system prompt (SOUL + chat mechanics).
    assert "You are Aya" in body["preview"]
    assert "Be concise." in body["preview"]


@pytest.mark.asyncio(loop_scope="session")
async def test_put_persona_upserts_and_records_audit(client, db):
    await login(client, db, email="persona-put@example.com", password="pw")

    resp = await client.put(
        "/agent/persona",
        json={"name": "Nova", "role": "copilot", "tone": "playful"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Nova"
    assert body["role"] == "copilot"
    assert "You are Nova, copilot." in body["preview"]

    # An audit row for the persona edit should have been recorded.
    db.expire_all()
    rows = list(
        (
            await db.execute(
                select(AuditLog).where(AuditLog.entity_type == "agent_persona")
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) >= 1


@pytest.mark.asyncio(loop_scope="session")
async def test_reset_persona_restores_default(client, db):
    await login(client, db, email="persona-reset@example.com", password="pw")

    await client.put("/agent/persona", json={"name": "Nova", "role": "copilot"})
    resp = await client.post("/agent/persona/reset")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Aya"
    assert "You are Aya" in body["preview"]
