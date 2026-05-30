from app.audit.revert import revert_audit
from app.audit.service import record_create
from app.models.context import Context
from app.models.project import Project


async def test_revert_project_create_deletes_it(db):
    ctx = Context(slug="upsun", name="Upsun")
    db.add(ctx)
    await db.flush()
    proj = Project(context_id=ctx.id, slug="dispatch", title="Dispatch")
    db.add(proj)
    await db.flush()
    audit = await record_create(db, "project", proj, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    assert await db.get(Project, proj.id) is None
    assert audit.reverted is True
