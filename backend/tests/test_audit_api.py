from tests.helpers import login


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
