import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.review import Review
from app.schemas.review import ReviewCreate, ReviewUpdate

ENTITY = "review"


async def list_reviews(db: AsyncSession) -> list[Review]:
    result = await db.execute(select(Review).order_by(Review.date.desc()))
    return list(result.scalars().all())


async def get_review(db: AsyncSession, review_id: uuid.UUID) -> Review | None:
    return await db.get(Review, review_id)


async def create_review(db: AsyncSession, data: ReviewCreate, *, surface: str = "api") -> Review:
    obj = Review(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_review(
    db: AsyncSession, obj: Review, data: ReviewUpdate, *, surface: str = "api"
) -> Review:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_review(db: AsyncSession, obj: Review, *, surface: str = "api") -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
