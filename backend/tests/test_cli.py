from app.cli import _seed_user
from app.services.auth import authenticate_user


async def test_seed_user_creates_and_is_authenticatable(db, engine):
    # _seed_user opens its own session via SessionLocal bound to the dev engine,
    # so for the test we call the inner coroutine with the test session directly.
    await _seed_user(db, "new@example.com", "secret", "New User")
    await db.flush()
    user = await authenticate_user(db, "new@example.com", "secret")
    assert user is not None
    assert user.name == "New User"
