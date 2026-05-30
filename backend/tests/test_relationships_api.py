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
