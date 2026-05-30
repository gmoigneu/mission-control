from fastapi import FastAPI, Request
from sqlalchemy.exc import IntegrityError
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse

from app.api import (
    admin,
    agent,
    audit,
    auth,
    companies,
    contexts,
    entity_links,
    entity_tags,
    graph,
    health,
    inbox,
    observations,
    people,
    projects,
    relationships,
    search,
    tags,
    task_links,
    tasks,
)
from app.config import settings

# Postgres error codes relevant to constraint violations
_PG_FK_VIOLATION = "23503"
_PG_UNIQUE_VIOLATION = "23505"
_PG_CHECK_VIOLATION = "23514"


def create_app() -> FastAPI:
    app = FastAPI(title="mission-control")
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        same_site="lax",
        https_only=settings.environment != "development",
    )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        pgcode = getattr(getattr(exc, "orig", None), "sqlstate", None)
        if pgcode == _PG_FK_VIOLATION:
            status_code = 422
            detail = "Referenced entity does not exist (foreign key violation)"
        elif pgcode == _PG_UNIQUE_VIOLATION:
            status_code = 409
            detail = "A record with those values already exists (unique constraint violation)"
        elif pgcode == _PG_CHECK_VIOLATION:
            status_code = 422
            detail = "Value violates a database check constraint"
        else:
            status_code = 409
            detail = "Request conflicts with current database state"
        return JSONResponse(status_code=status_code, content={"detail": detail})

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(agent.router)
    app.include_router(contexts.router)
    app.include_router(projects.router)
    app.include_router(companies.router)
    app.include_router(people.router)
    app.include_router(tasks.router)
    app.include_router(relationships.router)
    app.include_router(observations.router)
    app.include_router(tags.router)
    app.include_router(entity_tags.router)
    app.include_router(entity_links.router)
    app.include_router(task_links.router)
    app.include_router(inbox.router)
    app.include_router(audit.router)
    app.include_router(admin.router)
    app.include_router(search.router)
    app.include_router(graph.router)
    return app


app = create_app()
