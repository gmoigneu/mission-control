"""Shared limit/offset pagination helpers for list endpoints.

List endpoints keep returning a plain JSON array body (so existing clients and
tests are unaffected) and advertise paging metadata via response headers:

- ``X-Total-Count``  total number of rows matching the query (ignoring paging)
- ``X-Limit``        the limit that was applied
- ``X-Offset``       the offset that was applied
- ``X-Next-Offset``  offset to fetch the next page; only present when one exists
"""

from dataclasses import dataclass

from fastapi import Query, Response

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


@dataclass(frozen=True)
class Page:
    """Validated limit/offset paging parameters for a list request."""

    limit: int
    offset: int


def page_params(
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> Page:
    """FastAPI dependency yielding validated paging parameters."""
    return Page(limit=limit, offset=offset)


def set_pagination_headers(response: Response, *, total: int, page: Page) -> None:
    """Attach paging metadata headers to ``response``."""
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Limit"] = str(page.limit)
    response.headers["X-Offset"] = str(page.offset)
    next_offset = page.offset + page.limit
    if next_offset < total:
        response.headers["X-Next-Offset"] = str(next_offset)
