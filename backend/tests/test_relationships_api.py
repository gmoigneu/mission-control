import uuid

from app.models.person import Person
from tests.helpers import login


async def test_relationships_crud_requires_auth(client):
    assert (await client.get("/relationships")).status_code == 401


async def test_relationships_crud_flow(client, db):
    await login(client, db)

    # Create two Person rows via the db fixture
    person_a = Person(slug=f"rel-person-a-{uuid.uuid4().hex[:6]}", name="Alice")
    person_b = Person(slug=f"rel-person-b-{uuid.uuid4().hex[:6]}", name="Bob")
    db.add(person_a)
    db.add(person_b)
    await db.flush()

    created = await client.post(
        "/relationships",
        json={
            "from_person_id": str(person_a.id),
            "to_person_id": str(person_b.id),
            "type": "colleague",
        },
    )
    assert created.status_code == 201
    data = created.json()
    rid = data["id"]
    assert data["type"] == "colleague"
    assert data["from_person_id"] == str(person_a.id)
    assert data["to_person_id"] == str(person_b.id)
    assert data["from_person_name"] == "Alice"
    assert data["from_person_slug"] == person_a.slug
    assert data["to_person_name"] == "Bob"
    assert data["to_person_slug"] == person_b.slug

    listing = await client.get("/relationships")
    assert listing.status_code == 200
    assert any(r["id"] == rid for r in listing.json())

    patched = await client.patch(f"/relationships/{rid}", json={"notes": "met at conf"})
    assert patched.status_code == 200
    assert patched.json()["notes"] == "met at conf"

    got = await client.get(f"/relationships/{rid}")
    assert got.json()["notes"] == "met at conf"

    deleted = await client.delete(f"/relationships/{rid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/relationships/{rid}")).status_code == 404


async def test_get_missing_relationship_404(client, db):
    await login(client, db)

    assert (await client.get(f"/relationships/{uuid.uuid4()}")).status_code == 404


async def test_relationships_search_matches_related_person_names(client, db):
    await login(client, db)

    alice = Person(slug=f"rel-alice-{uuid.uuid4().hex[:6]}", name="Alice Archive")
    bob = Person(slug=f"rel-bob-{uuid.uuid4().hex[:6]}", name="Bob Builder")
    clara = Person(slug=f"rel-clara-{uuid.uuid4().hex[:6]}", name="Clara Composer")
    db.add_all([alice, bob, clara])
    await db.flush()

    alice_rel = await client.post(
        "/relationships",
        json={
            "from_person_id": str(alice.id),
            "to_person_id": str(bob.id),
            "type": "colleague",
        },
    )
    clara_rel = await client.post(
        "/relationships",
        json={
            "from_person_id": str(clara.id),
            "to_person_id": str(bob.id),
            "type": "mentor",
        },
    )
    assert alice_rel.status_code == 201
    assert clara_rel.status_code == 201

    listing = await client.get("/relationships?q=alice")

    assert listing.status_code == 200
    rows = listing.json()
    assert [row["id"] for row in rows] == [alice_rel.json()["id"]]
    assert rows[0]["from_person_name"] == "Alice Archive"
    assert rows[0]["to_person_name"] == "Bob Builder"
