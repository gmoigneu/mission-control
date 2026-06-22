import uuid

from app.models.audit import AuditLog
from tests.helpers import login


async def test_audit_entity_type_filter(client, db):
    """I11 — entity_type filter returns only rows of that type."""
    await login(client, db)

    await client.post("/contexts", json={"slug": "audit-filter-ctx", "name": "AuditFilterCtx"})

    r = await client.get("/audit?entity_type=context")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    assert all(row["entity_type"] == "context" for row in rows)


async def test_audit_limit_bound(client, db):
    """I11 — limit is bounded to 1000."""
    await login(client, db)
    # limit > 1000 should be rejected with 422
    r = await client.get("/audit?limit=9999")
    assert r.status_code == 422


async def test_audit_agent_runs_only_filter(client, db):
    await login(client, db)
    human_task_id = uuid.uuid4()
    aya_task_id = uuid.uuid4()
    agent_run_id = uuid.uuid4()

    db.add(
        AuditLog(
            actor="user",
            action="update",
            entity_type="task",
            entity_id=human_task_id,
            before=None,
            after={"title": "Human edit"},
            surface="ui",
            agent_run_id=None,
        )
    )
    db.add(
        AuditLog(
            actor="agent",
            action="update",
            entity_type="task",
            entity_id=aya_task_id,
            before=None,
            after={"title": "Aya edit"},
            surface="agent",
            agent_run_id=agent_run_id,
        )
    )
    await db.commit()

    r = await client.get("/audit?agent_runs_only=true")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    assert all(row["agent_run_id"] is not None for row in rows)
    assert any(row["entity_id"] == str(aya_task_id) for row in rows)
    assert all(row["entity_id"] != str(human_task_id) for row in rows)


async def test_create_then_revert_via_api(client, db):
    await login(client, db)

    created = await client.post("/contexts", json={"slug": "gaal", "name": "Gaal"})
    cid = created.json()["id"]

    audit_list = await client.get("/audit")
    assert audit_list.status_code == 200
    create_entries = [
        a for a in audit_list.json() if a["action"] == "create" and a["entity_type"] == "context"
    ]
    assert len(create_entries) >= 1
    audit_id = create_entries[0]["id"]

    reverted = await client.post(f"/audit/{audit_id}/revert")
    assert reverted.status_code == 200
    assert reverted.json()["reverted"] is True

    # the context is gone after reverting its creation
    assert (await client.get(f"/contexts/{cid}")).status_code == 404
