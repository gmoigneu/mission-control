import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.observation import Observation
from app.schemas.observation import ObservationCreate, ObservationUpdate

ENTITY = "observation"


async def list_observations(
    db: AsyncSession,
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
) -> list[Observation]:
    stmt = select(Observation)
    if subject_type is not None:
        stmt = stmt.where(Observation.subject_type == subject_type)
    if subject_id is not None:
        stmt = stmt.where(Observation.subject_id == subject_id)
    result = await db.execute(stmt.order_by(Observation.created_at))
    return list(result.scalars().all())


async def get_observation(db: AsyncSession, observation_id: uuid.UUID) -> Observation | None:
    return await db.get(Observation, observation_id)


async def create_observation(
    db: AsyncSession, data: ObservationCreate, *, surface: str = "api"
) -> Observation:
    obj = Observation(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_observation(
    db: AsyncSession, obj: Observation, data: ObservationUpdate, *, surface: str = "api"
) -> Observation:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_observation(
    db: AsyncSession, obj: Observation, *, surface: str = "api"
) -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
