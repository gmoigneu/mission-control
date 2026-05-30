import uuid

from app.models.context import Context
from tests.helpers import login


async def test_entity_links_requires_auth(client):
    assert (await client.get("/entity-links")).status_code == 401


async def test_entity_links_crud_flow(client, db):
    await login(client, db)

    ctx_a = Context(slug=f"el-ctx-a-{uuid.uuid4().hex[:6]}", name="EL Context A")
    db.add(ctx_a)
    ctx_b = Context(slug=f"el-ctx-b-{uuid.uuid4().hex[:6]}", name="EL Context B")
    db.add(ctx_b)
    await db.flush()

    created = await client.post(
        "/entity-links",
        json={
            "from_type": "context",
            "from_id": str(ctx_a.id),
            "to_type": "context",
            "to_id": str(ctx_b.id),
            "kind": "related",
        },
    )
    assert created.status_code == 201
    data = created.json()
    elid = data["id"]
    assert data["from_type"] == "context"
    assert data["from_id"] == str(ctx_a.id)
    assert data["to_type"] == "context"
    assert data["to_id"] == str(ctx_b.id)
    assert data["kind"] == "related"

    # Filter by from_type + from_id: should find it
    matched = await client.get(
        f"/entity-links?from_type=context&from_id={ctx_a.id}"
    )
    assert matched.status_code == 200
    assert any(e["id"] == elid for e in matched.json())

    # Filter with a different from_id: should not find it
    other_id = uuid.uuid4()
    unmatched = await client.get(
        f"/entity-links?from_type=context&from_id={other_id}"
    )
    assert unmatched.status_code == 200
    assert all(e["id"] != elid for e in unmatched.json())

    # GET by id
    got = await client.get(f"/entity-links/{elid}")
    assert got.status_code == 200
    assert got.json()["id"] == elid

    # DELETE -> 204 -> 404
    deleted = await client.delete(f"/entity-links/{elid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/entity-links/{elid}")).status_code == 404


async def test_get_missing_entity_link_404(client, db):
    await login(client, db)
    assert (await client.get(f"/entity-links/{uuid.uuid4()}")).status_code == 404
