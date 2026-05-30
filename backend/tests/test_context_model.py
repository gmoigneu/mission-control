from sqlalchemy import select

from app.models.context import Context


async def test_create_context(db):
    db.add(Context(slug="upsun", name="Upsun", category="work"))
    await db.flush()
    fetched = (await db.execute(select(Context).where(Context.slug == "upsun"))).scalar_one()
    assert fetched.id is not None
    assert fetched.status == "active"
