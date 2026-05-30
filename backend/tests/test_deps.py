from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.deps import get_current_user


async def test_missing_session_raises_401(db):
    req = SimpleNamespace(session={})
    with pytest.raises(HTTPException) as exc:
        await get_current_user(req, db)
    assert exc.value.status_code == 401


async def test_malformed_user_id_raises_401(db):
    req = SimpleNamespace(session={"user_id": "not-a-uuid"})
    with pytest.raises(HTTPException) as exc:
        await get_current_user(req, db)
    assert exc.value.status_code == 401
