from app.models.user import AppUser
from app.security import hash_password


async def _login(client, db):
    db.add(AppUser(email="g@example.com", password_hash=hash_password("pw")))
    await db.flush()
    resp = await client.post("/auth/login", json={"email": "g@example.com", "password": "pw"})
    assert resp.status_code == 200


async def test_create_then_revert_via_api(client, db):
    await _login(client, db)

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
