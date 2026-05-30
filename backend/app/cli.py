import asyncio

import httpx
import typer
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.openai_auth import (
    exchange_authorization_code,
    poll_for_authorization,
    request_device_code,
)
from app.agent.persona_store import upsert_persona
from app.agent.token_store import get_credential, upsert_credential
from app.db import SessionLocal
from app.demo_seed import seed_demo
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


@cli.command("seed-demo")
def seed_demo_cmd(
    email: str = typer.Option("demo@missioncontrol.app", help="Demo user email"),
    password: str = typer.Option("demo12345", help="Demo user password"),
    name: str = typer.Option("Alex Rivera", help="Demo user display name"),
    reset: bool = typer.Option(
        True, "--reset/--no-reset", help="Wipe domain tables first (preserves OpenAI auth)"
    ),
) -> None:
    """Seed a fictional demo dataset (safe to screenshot/share); resets by default."""

    async def _run() -> None:
        async with SessionLocal() as db:
            counts = await seed_demo(db, email=email, password=password, name=name, reset=reset)
            await db.commit()
        summary = ", ".join(f"{n} {k}" for k, n in counts.items())
        typer.echo(f"Seeded demo data ({summary}).")
        typer.echo(f"Login: {email} / {password}")

    asyncio.run(_run())


# A friendly default SOUL used by ``seed-persona`` and ``seed-demo``.
_FRIENDLY_PERSONA = {
    "name": "Aya",
    "role": "your mission-control assistant",
    "tone": "Warm, direct, and concise. Speak plainly; skip filler.",
    "greeting": "Hey — I'm Aya. What can I take off your plate?",
    "principles": (
        "Act on the user's data with their intent in mind. Prefer doing over "
        "explaining. Surface what you changed so it can be undone."
    ),
    "boundaries": (
        "Never invent data. When unsure, ask a brief clarifying question "
        "instead of guessing."
    ),
    "instructions": (
        "You help a single trusted user track and manage their life across "
        "people, projects, tasks, and notes. Keep replies short and useful."
    ),
    "enabled": True,
}


async def _seed_persona(db: AsyncSession) -> None:
    await upsert_persona(db, **_FRIENDLY_PERSONA)


@cli.command("seed-persona")
def seed_persona() -> None:
    """Set a friendly default SOUL (Aya's identity/voice)."""

    async def _run() -> None:
        async with SessionLocal() as db:
            await _seed_persona(db)
            await db.commit()
        typer.echo("Seeded Aya persona (SOUL).")

    asyncio.run(_run())


async def _auth_openai(http: httpx.AsyncClient, db: AsyncSession) -> None:
    device = await request_device_code(http)
    typer.echo("\nTo authorize mission-control with your ChatGPT account:")
    typer.echo(f"  1. Open: {device.verification_uri}")
    typer.echo(f"  2. Enter code: {device.user_code}\n")
    typer.echo("Waiting for approval… (Ctrl-C to cancel)")
    auth = await poll_for_authorization(http, device)
    tokens = await exchange_authorization_code(http, auth.authorization_code, auth.code_verifier)
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
    typer.echo(f"Authorized. account_id={tokens.account_id}")


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
