import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.audit.serialize import model_to_dict
from app.audit.service import record_create, record_delete, record_update
from app.models.person import Person
from app.models.relationship import Relationship
from app.schemas.relationship import RelationshipCreate, RelationshipUpdate
from app.services.pagination import apply_window, count_rows

ENTITY = "relationship"


def _relationship_out(
    obj: Relationship,
    *,
    from_person_name: str | None,
    from_person_slug: str | None,
    to_person_name: str | None,
    to_person_slug: str | None,
) -> dict[str, Any]:
    return {
        **model_to_dict(obj),
        "from_person_name": from_person_name,
        "from_person_slug": from_person_slug,
        "to_person_name": to_person_name,
        "to_person_slug": to_person_slug,
    }


def _relationship_details_stmt(q: str | None = None):
    from_person = aliased(Person)
    to_person = aliased(Person)
    stmt = (
        select(
            Relationship,
            from_person.name,
            from_person.slug,
            to_person.name,
            to_person.slug,
        )
        .join(from_person, Relationship.from_person_id == from_person.id)
        .join(to_person, Relationship.to_person_id == to_person.id)
        .order_by(Relationship.created_at)
    )
    terms = q.strip().split() if q else []
    for term in terms:
        pattern = f"%{term}%"
        stmt = stmt.where(
            or_(
                from_person.name.ilike(pattern),
                from_person.slug.ilike(pattern),
                to_person.name.ilike(pattern),
                to_person.slug.ilike(pattern),
            )
        )
    return stmt


async def list_relationships(
    db: AsyncSession, *, limit: int | None = None, offset: int = 0, q: str | None = None
) -> list[dict[str, Any]]:
    stmt = apply_window(_relationship_details_stmt(q), limit=limit, offset=offset)
    result = await db.execute(stmt)
    return [
        _relationship_out(
            obj,
            from_person_name=from_person_name,
            from_person_slug=from_person_slug,
            to_person_name=to_person_name,
            to_person_slug=to_person_slug,
        )
        for obj, from_person_name, from_person_slug, to_person_name, to_person_slug in result.all()
    ]


async def count_relationships(db: AsyncSession, *, q: str | None = None) -> int:
    return await count_rows(db, _relationship_details_stmt(q))


async def get_relationship(db: AsyncSession, relationship_id: uuid.UUID) -> Relationship | None:
    return await db.get(Relationship, relationship_id)


async def get_relationship_out(
    db: AsyncSession, relationship_id: uuid.UUID
) -> dict[str, Any] | None:
    result = await db.execute(
        _relationship_details_stmt().where(Relationship.id == relationship_id)
    )
    row = result.first()
    if row is None:
        return None
    obj, from_person_name, from_person_slug, to_person_name, to_person_slug = row
    return _relationship_out(
        obj,
        from_person_name=from_person_name,
        from_person_slug=from_person_slug,
        to_person_name=to_person_name,
        to_person_slug=to_person_slug,
    )


async def create_relationship(
    db: AsyncSession, data: RelationshipCreate, *, surface: str = "api"
) -> Relationship:
    obj = Relationship(**data.model_dump())
    db.add(obj)
    await db.flush()
    await record_create(db, ENTITY, obj, surface=surface)
    return obj


async def update_relationship(
    db: AsyncSession, obj: Relationship, data: RelationshipUpdate, *, surface: str = "api"
) -> Relationship:
    before = model_to_dict(obj)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    await record_update(db, ENTITY, obj, before, surface=surface)
    return obj


async def delete_relationship(
    db: AsyncSession, obj: Relationship, *, surface: str = "api"
) -> None:
    before = model_to_dict(obj)
    entity_id = obj.id
    await db.delete(obj)
    await db.flush()
    await record_delete(db, ENTITY, before, entity_id, surface=surface)
