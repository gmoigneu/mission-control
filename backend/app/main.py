from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.api import health
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
    return app


app = create_app()
