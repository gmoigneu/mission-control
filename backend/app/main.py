from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.api import audit, auth, companies, contexts, health, people, projects, relationships, tasks
from app.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="mission-control")
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        same_site="lax",
        https_only=settings.environment != "development",
    )
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(contexts.router)
    app.include_router(projects.router)
    app.include_router(companies.router)
    app.include_router(people.router)
    app.include_router(tasks.router)
    app.include_router(relationships.router)
    app.include_router(audit.router)
    return app


app = create_app()
