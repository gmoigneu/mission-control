from sqlalchemy import func, select

from app.config import settings
from app.models.chunk import Chunk
from app.models.context import Context
from app.search.index import deindex_subject, index_subject


async def test_index_subject_creates_one_chunk(db):
    ctx = Context(
        slug="upsun-idx", name="Upsun", category="work", description="platform as a service"
    )
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)

    count = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert count == 1


async def test_index_subject_chunk_has_content_and_embedding(db):
    ctx = Context(
        slug="upsun-idx2", name="Upsun2", category="work", description="platform as a service"
    )
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)

    chunk = (await db.execute(
        select(Chunk).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert chunk.content.strip() != ""
    assert len(chunk.embedding) == settings.embeddings_dim


async def test_reindex_still_one_chunk(db):
    ctx = Context(
        slug="upsun-idx3", name="Upsun3", category="work", description="platform as a service"
    )
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)
    # Re-index (simulate update)
    await index_subject(db, "context", ctx)

    count = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert count == 1


async def test_deindex_removes_chunk(db):
    ctx = Context(
        slug="upsun-idx4", name="Upsun4", category="work", description="platform as a service"
    )
    db.add(ctx)
    await db.flush()

    await index_subject(db, "context", ctx)
    await deindex_subject(db, "context", ctx.id)

    count = (await db.execute(
        select(func.count()).where(Chunk.subject_type == "context", Chunk.subject_id == ctx.id)
    )).scalar_one()
    assert count == 0
