import uuid

from app.models.context import Context
from app.models.person import Person
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
    assert data["from_name"] == "EL Context A"
    assert data["from_slug"] == ctx_a.slug
    assert data["to_name"] == "EL Context B"
    assert data["to_slug"] == ctx_b.slug

    # Filter by from_type + from_id: should find it
    matched = await client.get(
        f"/entity-links?from_type=context&from_id={ctx_a.id}"
    )
    assert matched.status_code == 200
    assert matched.headers["X-Total-Count"] == "1"
    assert matched.headers["X-Limit"] == "50"
    assert any(e["id"] == elid for e in matched.json())

    # Filter with a different from_id: should not find it
    other_id = uuid.uuid4()
    unmatched = await client.get(
        f"/entity-links?from_type=context&from_id={other_id}"
    )
    assert unmatched.status_code == 200
    assert unmatched.headers["X-Total-Count"] == "0"
    assert all(e["id"] != elid for e in unmatched.json())

    # GET by id
    got = await client.get(f"/entity-links/{elid}")
    assert got.status_code == 200
    assert got.json()["id"] == elid

    # DELETE -> 204 -> 404
    deleted = await client.delete(f"/entity-links/{elid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/entity-links/{elid}")).status_code == 404


async def test_entity_links_list_pagination_headers(client, db):
    await login(client, db)

    contexts = [
        Context(slug=f"el-page-ctx-{i}-{uuid.uuid4().hex[:6]}", name=f"EL Page {i}")
        for i in range(4)
    ]
    db.add_all(contexts)
    await db.flush()

    for i in range(3):
        created = await client.post(
            "/entity-links",
            json={
                "from_type": "context",
                "from_id": str(contexts[i].id),
                "to_type": "context",
                "to_id": str(contexts[i + 1].id),
                "kind": "related",
            },
        )
        assert created.status_code == 201

    first = await client.get("/entity-links?limit=2&offset=0")
    assert first.status_code == 200
    assert len(first.json()) == 2
    assert first.headers["X-Total-Count"] == "3"
    assert first.headers["X-Limit"] == "2"
    assert first.headers["X-Offset"] == "0"
    assert first.headers["X-Next-Offset"] == "2"

    last = await client.get("/entity-links?limit=2&offset=2")
    assert last.status_code == 200
    assert len(last.json()) == 1
    assert "X-Next-Offset" not in last.headers


async def test_get_missing_entity_link_404(client, db):
    await login(client, db)
    assert (await client.get(f"/entity-links/{uuid.uuid4()}")).status_code == 404


async def test_entity_links_search_matches_either_endpoint_name(client, db):
    await login(client, db)

    person = Person(slug=f"el-person-{uuid.uuid4().hex[:6]}", name="Ada Artist")
    context = Context(slug=f"el-context-{uuid.uuid4().hex[:6]}", name="Launch Room")
    other_context = Context(slug=f"el-other-{uuid.uuid4().hex[:6]}", name="Archive Room")
    db.add_all([person, context, other_context])
    await db.flush()

    matching = await client.post(
        "/entity-links",
        json={
            "from_type": "person",
            "from_id": str(person.id),
            "to_type": "context",
            "to_id": str(context.id),
            "kind": "related",
        },
    )
    nonmatching = await client.post(
        "/entity-links",
        json={
            "from_type": "context",
            "from_id": str(other_context.id),
            "to_type": "context",
            "to_id": str(context.id),
            "kind": "related",
        },
    )
    assert matching.status_code == 201
    assert nonmatching.status_code == 201

    listing = await client.get("/entity-links?q=ada")

    assert listing.status_code == 200
    assert listing.headers["X-Total-Count"] == "1"
    rows = listing.json()
    assert [row["id"] for row in rows] == [matching.json()["id"]]
    assert rows[0]["from_name"] == "Ada Artist"
    assert rows[0]["from_slug"] == person.slug
    assert rows[0]["to_name"] == "Launch Room"
