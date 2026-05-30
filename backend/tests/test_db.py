from sqlalchemy import text


async def test_session_executes_select(db):
    result = await db.execute(text("SELECT 1"))
    assert result.scalar_one() == 1


async def test_vector_extension_present(db):
    result = await db.execute(text("SELECT count(*) FROM pg_extension WHERE extname = 'vector'"))
    assert result.scalar_one() == 1
