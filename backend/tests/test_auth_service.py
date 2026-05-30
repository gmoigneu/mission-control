from app.models.user import AppUser
from app.security import hash_password
from app.services.auth import authenticate_user, get_user_by_email


async def _make_user(db, email="g@example.com", password="hunter2"):
    user = AppUser(email=email, password_hash=hash_password(password))
    db.add(user)
    await db.flush()
    return user


async def test_get_user_by_email(db):
    await _make_user(db)
    found = await get_user_by_email(db, "g@example.com")
    assert found is not None
    assert found.email == "g@example.com"


async def test_authenticate_success(db):
    await _make_user(db)
    user = await authenticate_user(db, "g@example.com", "hunter2")
    assert user is not None


async def test_authenticate_wrong_password(db):
    await _make_user(db)
    user = await authenticate_user(db, "g@example.com", "nope")
    assert user is None


async def test_authenticate_unknown_email(db):
    user = await authenticate_user(db, "missing@example.com", "x")
    assert user is None
