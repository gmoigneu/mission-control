import uuid

from sqlalchemy import select

from app.models.chunk import Chunk


async def test_chunk_insert_and_query(db):
    subject_id = uuid.uuid4()
    embedding = [0.1] * 1536
    db.add(
        Chunk(
            subject_type="context",
            subject_id=subject_id,
            chunk_index=0,
            content="test content",
            embedding=embedding,
        )
    )
    await db.flush()
    row = (
        await db.execute(select(Chunk).where(Chunk.subject_id == subject_id))
    ).scalar_one()
    assert row.id is not None
    assert row.subject_type == "context"
    assert len(row.embedding) == 1536
