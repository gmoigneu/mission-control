import asyncio

import typer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models.user import AppUser
from app.security import hash_password
from app.services.auth import get_user_by_email

cli = typer.Typer(help="mission-control backend admin CLI")


@cli.callback()
def main() -> None:
    """mission-control backend admin CLI."""


async def _seed_user(db: AsyncSession, email: str, password: str, name: str | None) -> None:
    existing = await get_user_by_email(db, email)
    if existing is not None:
        existing.password_hash = hash_password(password)
        if name is not None:
            existing.name = name
    else:
        db.add(AppUser(email=email, name=name, password_hash=hash_password(password)))


async def _run_seed(email: str, password: str, name: str | None) -> None:
    async with SessionLocal() as db:
        await _seed_user(db, email, password, name)
        await db.commit()


@cli.command("seed-user")
def seed_user(
    email: str = typer.Option(..., help="User email"),
    password: str = typer.Option(..., help="User password"),
    name: str | None = typer.Option(None, help="Display name"),
) -> None:
    """Create or update the single application user."""
    asyncio.run(_run_seed(email, password, name))
    typer.echo(f"Seeded user {email}")


if __name__ == "__main__":
    cli()
