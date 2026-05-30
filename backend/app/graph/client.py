from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

# Runner type: async callable taking (cypher, params) → list of record dicts.
# Defined here so projectors/queries can import it for type hints without
# triggering the neo4j driver import.
Runner = Callable[[str, dict], Awaitable[list[dict]]]

if TYPE_CHECKING:
    import neo4j  # noqa: F401

_driver: neo4j.AsyncDriver | None = None


def _get_driver() -> neo4j.AsyncDriver:
    """Return (or lazily create) the module-level AsyncDriver singleton."""
    global _driver
    if _driver is None:
        import neo4j as _neo4j  # imported lazily so startup doesn't need Neo4j

        from app.config import settings

        _driver = _neo4j.AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _driver


async def neo4j_runner(cypher: str, params: dict) -> list[dict]:
    """Real Runner: executes *cypher* against Neo4j and returns record dicts."""
    driver = _get_driver()
    async with driver.session() as session:
        result = await session.run(cypher, params)
        records = await result.data()
        return [dict(r) for r in records]


async def close_driver() -> None:
    """Dispose the cached driver (call on application shutdown)."""
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
