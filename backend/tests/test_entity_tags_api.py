import uuid

from app.models.person import Person
from app.models.tag import Tag
from tests.helpers import login


async def test_entity_tags_requires_auth(client):
    assert (await client.get("/entity-tags")).status_code == 401


async def test_entity_tags_crud_flow(client, db):
    await login(client, db)

    tag = Tag(name=f"et-tag-{uuid.uuid4().hex[:6]}", kind="domain")
    db.add(tag)
    person = Person(slug=f"et-person-{uuid.uuid4().hex[:6]}", name="ET Subject")
    db.add(person)
    await db.flush()

    created = await client.post(
        "/entity-tags",
        json={
            "tag_id": str(tag.id),
            "subject_type": "person",
            "subject_id": str(person.id),
        },
    )
    assert created.status_code == 201
    data = created.json()
    etid = data["id"]
    assert data["tag_id"] == str(tag.id)
    assert data["subject_type"] == "person"
    assert data["subject_id"] == str(person.id)

    # Filter by subject: should find it
    matched = await client.get(
        f"/entity-tags?subject_type=person&subject_id={person.id}"
    )
    assert matched.status_code == 200
    assert matched.headers["X-Total-Count"] == "1"
    assert matched.headers["X-Limit"] == "50"
    assert any(e["id"] == etid for e in matched.json())

    # Filter with a different subject_id: should not find it
    other_id = uuid.uuid4()
    unmatched = await client.get(
        f"/entity-tags?subject_type=person&subject_id={other_id}"
    )
    assert unmatched.status_code == 200
    assert unmatched.headers["X-Total-Count"] == "0"
    assert all(e["id"] != etid for e in unmatched.json())

    # GET by id
    got = await client.get(f"/entity-tags/{etid}")
    assert got.status_code == 200
    assert got.json()["id"] == etid

    # DELETE -> 204 -> 404
    deleted = await client.delete(f"/entity-tags/{etid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/entity-tags/{etid}")).status_code == 404


async def test_get_missing_entity_tag_404(client, db):
    await login(client, db)
    assert (await client.get(f"/entity-tags/{uuid.uuid4()}")).status_code == 404
