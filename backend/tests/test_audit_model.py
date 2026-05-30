import uuid

from sqlalchemy import select

from app.models.audit import AuditLog


async def test_create_audit_row(db):
    entry = AuditLog(
        actor="user",
        action="create",
        entity_type="context",
        entity_id=uuid.uuid4(),
        before=None,
        after={"slug": "x"},
        surface="ui",
    )
    db.add(entry)
    await db.flush()
    fetched = (await db.execute(select(AuditLog))).scalars().one()
    assert fetched.reverted is False
    assert fetched.after == {"slug": "x"}
