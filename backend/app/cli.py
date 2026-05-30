import asyncio

import httpx
import typer
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.openai_auth import poll_for_token, request_device_code
from app.agent.token_store import get_credential, upsert_credential
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


async def _auth_openai(http: httpx.AsyncClient, db: AsyncSession) -> None:
    device = await request_device_code(http)
    typer.echo("\nTo authorize mission-control with your ChatGPT account:")
    typer.echo(f"  1. Open: {device.verification_uri}")
    typer.echo(f"  2. Enter code: {device.user_code}\n")
    typer.echo("Waiting for approval… (Ctrl-C to cancel)")
    tokens = await poll_for_token(http, device)
    await upsert_credential(
        db,
        "openai",
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        id_token=tokens.id_token,
        account_id=tokens.account_id,
        plan_type=tokens.plan_type,
        expires_at=tokens.expires_at,
    )
    await db.commit()
    typer.echo(f"Authorized. account_id={tokens.account_id} plan={tokens.plan_type}")


@cli.command("auth-openai")
def auth_openai() -> None:
    """Authenticate mission-control with your ChatGPT subscription (device-code OAuth)."""

    async def _run() -> None:
        async with httpx.AsyncClient(timeout=120) as http, SessionLocal() as db:
            await _auth_openai(http, db)

    asyncio.run(_run())


async def _auth_status(db: AsyncSession) -> None:
    cred = await get_credential(db, "openai")
    if cred is None:
        typer.echo("No OpenAI credential stored. Run: python -m app.cli auth-openai")
    else:
        typer.echo(f"OpenAI authorized: account_id={cred.account_id} expires_at={cred.expires_at}")


@cli.command("auth-status")
def auth_status() -> None:
    """Show the stored OpenAI credential status."""

    async def _run() -> None:
        async with SessionLocal() as db:
            await _auth_status(db)

    asyncio.run(_run())


if __name__ == "__main__":
    cli()
