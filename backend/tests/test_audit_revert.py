
from sqlalchemy import func, select

from app.audit.revert import revert_audit
from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.audit import AuditLog
from app.models.context import Context


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def test_revert_create_deletes_entity(db):
    ctx = Context(slug="gaal", name="Gaal", category="side")
    db.add(ctx)
    await db.flush()
    audit = await record_create(db, "context", ctx, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    assert await db.get(Context, ctx.id) is None
    assert audit.reverted is True
    # a compensating delete audit row exists
    rows = (await db.execute(select(AuditLog).where(AuditLog.action == "delete"))).scalars().all()
    assert len(rows) == 1


async def test_revert_update_restores_previous_values(db):
    ctx = Context(slug="upsun", name="Upsun", category="work")
    db.add(ctx)
    await db.flush()
    before = model_to_dict(ctx)
    ctx.name = "Upsun Renamed"
    await db.flush()
    audit = await record_update(db, "context", ctx, before, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    restored = await db.get(Context, ctx.id)
    assert restored is not None
    assert restored.name == "Upsun"


async def test_revert_delete_reinserts_entity(db):
    ctx = Context(slug="num6", name="Number6", category="work")
    db.add(ctx)
    await db.flush()
    before = model_to_dict(ctx)
    cid = ctx.id
    await db.delete(ctx)
    await db.flush()
    audit = await record_delete(db, "context", before, cid, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    restored = await db.get(Context, cid)
    assert restored is not None
    assert restored.slug == "num6"


async def test_revert_twice_conflicts(db):
    from fastapi import HTTPException

    ctx = Context(slug="dup", name="Dup")
    db.add(ctx)
    await db.flush()
    audit = await record_create(db, "context", ctx, surface="ui")
    await db.flush()
    await revert_audit(db, audit, surface="ui")
    try:
        await revert_audit(db, audit, surface="ui")
        raise AssertionError("expected HTTPException")
    except HTTPException as exc:
        assert exc.status_code == 409


async def test_revert_create_when_row_already_deleted_raises_409(db):
    from fastapi import HTTPException

    ctx = Context(slug="gone", name="Gone")
    db.add(ctx)
    await db.flush()
    audit = await record_create(db, "context", ctx, surface="ui")
    await db.flush()
    # row deleted out from under the audit entry
    await db.delete(ctx)
    await db.flush()

    try:
        await revert_audit(db, audit, surface="ui")
        raise AssertionError("expected HTTPException 409")
    except HTTPException as exc:
        assert exc.status_code == 409


async def test_revert_update_when_row_deleted_raises_404(db):
    from fastapi import HTTPException

    ctx = Context(slug="upd", name="Upd")
    db.add(ctx)
    await db.flush()
    before = model_to_dict(ctx)
    ctx.name = "Changed"
    await db.flush()
    audit = await record_update(db, "context", ctx, before, surface="ui")
    await db.flush()
    await db.delete(ctx)
    await db.flush()

    try:
        await revert_audit(db, audit, surface="ui")
        raise AssertionError("expected HTTPException 404")
    except HTTPException as exc:
        assert exc.status_code == 404
