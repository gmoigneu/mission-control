from sqlalchemy import select

from app.models.user import AppUser


async def test_create_and_query_user(db):
    user = AppUser(email="g@example.com", name="G", password_hash="x")
    db.add(user)
    await db.flush()

    result = await db.execute(select(AppUser).where(AppUser.email == "g@example.com"))
    fetched = result.scalar_one()
    assert fetched.id is not None
    assert fetched.name == "G"
    assert fetched.settings == {}
