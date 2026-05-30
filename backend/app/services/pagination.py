"""Service-layer helper for applying limit/offset windows to list queries."""

from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def count_rows(db: AsyncSession, stmt: Select[Any]) -> int:
    """Return the number of rows the (unwindowed) ``stmt`` would yield."""
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    result = await db.execute(count_stmt)
    return int(result.scalar_one())


def apply_window[T](
    stmt: Select[tuple[T]], *, limit: int | None, offset: int
) -> Select[tuple[T]]:
    """Apply ``offset``/``limit`` to ``stmt`` when a limit is requested."""
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    return stmt
