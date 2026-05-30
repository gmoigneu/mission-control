import uuid
from datetime import datetime

from app.audit.serialize import coerce_value, model_to_dict
from app.models.audit import AuditLog


def test_model_to_dict_is_jsonable():
    eid = uuid.uuid4()
    entry = AuditLog(
        id=uuid.uuid4(), actor="user", action="create", entity_type="context",
        entity_id=eid, before=None, after={"a": 1}, surface="ui", reverted=False,
    )
    d = model_to_dict(entry)
    assert d["entity_id"] == str(eid)
    assert isinstance(d["id"], str)
    assert d["after"] == {"a": 1}


def test_coerce_value_roundtrips_uuid_and_datetime():
    u = uuid.uuid4()
    assert coerce_value(AuditLog, "entity_id", str(u)) == u
    dt = datetime(2026, 5, 29, 12, 0, 0)
    assert coerce_value(AuditLog, "created_at", dt.isoformat()) == dt
    assert coerce_value(AuditLog, "actor", "user") == "user"
