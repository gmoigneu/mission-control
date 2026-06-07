import uuid

from tests.helpers import login


async def test_search_requires_auth(client):
    assert (await client.get("/search?q=test")).status_code == 401


async def test_search_ranks_person_first_and_type_filter(client, db):
    email = f"search-{uuid.uuid4()}@example.com"
    await login(client, db, email=email, password="pw")

    # Create a person whose summary overlaps strongly with the query.
    person_slug = f"search-person-{uuid.uuid4()}"
    person_resp = await client.post(
        "/people",
        json={
            "slug": person_slug,
            "name": "Alice Engineer",
            "summary": "Senior Python backend engineer",
        },
    )
    assert person_resp.status_code == 201
    person_id = person_resp.json()["id"]

    # Create a context with a name that doesn't overlap with the query.
    ctx_resp = await client.post(
        "/contexts",
        json={"slug": f"search-ctx-{uuid.uuid4()}", "name": "Marketing", "category": "work"},
    )
    assert ctx_resp.status_code == 201

    # Belt-and-suspenders reindex.
    reindex_resp = await client.post("/admin/reindex")
    assert reindex_resp.status_code == 200

    # Search for "python engineer" — person should rank first.
    search_resp = await client.get("/search?q=python+engineer")
    assert search_resp.status_code == 200
    results = search_resp.json()
    assert len(results) >= 1
    assert results[0]["subject_type"] == "person"
    assert results[0]["subject_id"] == person_id
    # Results carry the entity's display name and slug for linking/rendering.
    assert results[0]["name"] == "Alice Engineer"
    assert results[0]["slug"] == person_slug

    # Search with type filter context — person must NOT appear.
    filtered_resp = await client.get("/search?q=python+engineer&types=context")
    assert filtered_resp.status_code == 200
    filtered_results = filtered_resp.json()
    person_ids = [r["subject_id"] for r in filtered_results]
    assert person_id not in person_ids
