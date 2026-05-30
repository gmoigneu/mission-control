import uuid

from app.models.person import Person
from tests.helpers import login


async def test_observations_crud_requires_auth(client):
    assert (await client.get("/observations")).status_code == 401


async def test_observations_crud_flow(client, db):
    await login(client, db)

    # Create a Person via the db fixture to use as subject
    person = Person(slug=f"obs-person-{uuid.uuid4().hex[:6]}", name="Obs Subject")
    db.add(person)
    await db.flush()

    created = await client.post(
        "/observations",
        json={
            "subject_type": "person",
            "subject_id": str(person.id),
            "body": "met at conf",
        },
    )
    assert created.status_code == 201
    data = created.json()
    oid = data["id"]
    assert data["body"] == "met at conf"
    assert data["subject_type"] == "person"
    assert data["subject_id"] == str(person.id)
    assert data["kind"] == "observation"

    listing = await client.get("/observations")
    assert listing.status_code == 200
    assert any(o["id"] == oid for o in listing.json())

    patched = await client.patch(f"/observations/{oid}", json={"body": "spoke at summit"})
    assert patched.status_code == 200
    assert patched.json()["body"] == "spoke at summit"

    got = await client.get(f"/observations/{oid}")
    assert got.json()["body"] == "spoke at summit"

    deleted = await client.delete(f"/observations/{oid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/observations/{oid}")).status_code == 404


async def test_observation_subject_filter(client, db):
    await login(client, db)

    person = Person(slug=f"obs-filter-{uuid.uuid4().hex[:6]}", name="Filter Subject")
    db.add(person)
    await db.flush()

    created = await client.post(
        "/observations",
        json={
            "subject_type": "person",
            "subject_id": str(person.id),
            "body": "filter test observation",
        },
    )
    assert created.status_code == 201

    # Filter by subject_type + subject_id: should return the observation
    matched = await client.get(
        f"/observations?subject_type=person&subject_id={person.id}"
    )
    assert matched.status_code == 200
    bodies = [o["body"] for o in matched.json()]
    assert "filter test observation" in bodies

    # Filter with a different subject_id: should return empty list
    other_id = uuid.uuid4()
    unmatched = await client.get(
        f"/observations?subject_type=person&subject_id={other_id}"
    )
    assert unmatched.status_code == 200
    assert unmatched.json() == []


async def test_get_missing_observation_404(client, db):
    await login(client, db)

    assert (await client.get(f"/observations/{uuid.uuid4()}")).status_code == 404
