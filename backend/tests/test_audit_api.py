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
