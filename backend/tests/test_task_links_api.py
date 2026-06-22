import uuid

from app.models.task import Task
from tests.helpers import login


async def test_task_links_requires_auth(client):
    assert (await client.get("/task-links")).status_code == 401


async def test_task_links_crud_flow(client, db):
    await login(client, db, email=f"tl-{uuid.uuid4().hex[:6]}@example.com")

    task_a = Task(title="Task A")
    db.add(task_a)
    task_b = Task(title="Task B")
    db.add(task_b)
    await db.flush()

    created = await client.post(
        "/task-links",
        json={
            "from_task_id": str(task_a.id),
            "to_task_id": str(task_b.id),
            "kind": "blocks",
        },
    )
    assert created.status_code == 201
    data = created.json()
    tlid = data["id"]
    assert data["from_task_id"] == str(task_a.id)
    assert data["to_task_id"] == str(task_b.id)
    assert data["kind"] == "blocks"

    # Filter by from_task_id: should find it
    matched = await client.get(f"/task-links?from_task_id={task_a.id}")
    assert matched.status_code == 200
    assert matched.headers["X-Total-Count"] == "1"
    assert matched.headers["X-Limit"] == "50"
    assert any(e["id"] == tlid for e in matched.json())

    # Filter with a different from_task_id: should not find it
    other_id = uuid.uuid4()
    unmatched = await client.get(f"/task-links?from_task_id={other_id}")
    assert unmatched.status_code == 200
    assert unmatched.headers["X-Total-Count"] == "0"
    assert all(e["id"] != tlid for e in unmatched.json())

    # GET by id
    got = await client.get(f"/task-links/{tlid}")
    assert got.status_code == 200
    assert got.json()["id"] == tlid

    # DELETE -> 204 -> 404
    deleted = await client.delete(f"/task-links/{tlid}")
    assert deleted.status_code == 204
    assert (await client.get(f"/task-links/{tlid}")).status_code == 404


async def test_get_missing_task_link_404(client, db):
    await login(client, db, email=f"tl-miss-{uuid.uuid4().hex[:6]}@example.com")
    assert (await client.get(f"/task-links/{uuid.uuid4()}")).status_code == 404
