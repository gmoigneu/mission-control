from tests.helpers import login


async def test_people_list_pagination_headers(client, db):
    """Entity list endpoints page via limit/offset and advertise paging headers."""
    await login(client, db)

    for i in range(5):
        created = await client.post(
            "/people", json={"slug": f"person-{i}", "name": f"Person {i}"}
        )
        assert created.status_code == 201

    first = await client.get("/people?limit=2&offset=0")
    assert first.status_code == 200
    assert len(first.json()) == 2
    assert first.headers["X-Total-Count"] == "5"
    assert first.headers["X-Limit"] == "2"
    assert first.headers["X-Offset"] == "0"
    assert first.headers["X-Next-Offset"] == "2"

    # Walk to the final page: no next-offset header once exhausted.
    last = await client.get("/people?limit=2&offset=4")
    assert last.status_code == 200
    assert len(last.json()) == 1
    assert last.headers["X-Total-Count"] == "5"
    assert "X-Next-Offset" not in last.headers


async def test_people_pagination_param_bounds(client, db):
    """limit is bounded and offset must be non-negative."""
    await login(client, db)
    assert (await client.get("/people?limit=0")).status_code == 422
    assert (await client.get("/people?limit=9999")).status_code == 422
    assert (await client.get("/people?offset=-1")).status_code == 422


async def test_people_default_limit_applied(client, db):
    """A request without paging params still returns paged headers."""
    await login(client, db)
    await client.post("/people", json={"slug": "solo", "name": "Solo"})

    r = await client.get("/people")
    assert r.status_code == 200
    assert r.headers["X-Total-Count"] == "1"
    assert r.headers["X-Limit"] == "50"
    assert r.headers["X-Offset"] == "0"
    assert "X-Next-Offset" not in r.headers


async def test_audit_pagination_offset(client, db):
    """Audit list supports offset and reports total/next via headers."""
    await login(client, db)

    for i in range(4):
        await client.post("/contexts", json={"slug": f"actx-{i}", "name": f"ACtx {i}"})

    r = await client.get("/audit?entity_type=context&limit=2&offset=0")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2
    assert r.headers["X-Total-Count"] == "4"
    assert r.headers["X-Next-Offset"] == "2"

    r2 = await client.get("/audit?entity_type=context&limit=2&offset=2")
    assert r2.status_code == 200
    assert len(r2.json()) == 2
    assert "X-Next-Offset" not in r2.headers
