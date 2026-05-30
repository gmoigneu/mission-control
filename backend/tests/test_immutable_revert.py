import uuid

from app.audit.revert import revert_audit
from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete
from app.models.entity_link import EntityLink
from app.models.entity_tag import EntityTag
from app.models.tag import Tag


async def test_revert_create_deletes_entity_tag(db):
    tag = Tag(name="ai")
    db.add(tag)
    await db.flush()
    et = EntityTag(tag_id=tag.id, subject_type="person", subject_id=uuid.uuid4())
    db.add(et)
    await db.flush()
    audit = await record_create(db, "entity_tag", et, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    assert await db.get(EntityTag, et.id) is None
    assert audit.reverted is True


async def test_revert_delete_reinserts_entity_link(db):
    link = EntityLink(
        from_type="context", from_id=uuid.uuid4(), to_type="context", to_id=uuid.uuid4()
    )
    db.add(link)
    await db.flush()
    before = model_to_dict(link)
    link_id = link.id
    await db.delete(link)
    await db.flush()
    audit = await record_delete(db, "entity_link", before, link_id, surface="ui")
    await db.flush()

    await revert_audit(db, audit, surface="ui")

    restored = await db.get(EntityLink, link_id)
    assert restored is not None
    assert restored.from_type == "context"
    assert restored.kind == "related"
