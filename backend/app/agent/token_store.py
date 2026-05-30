from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.oauth_credential import OAuthCredential


async def get_credential(db: AsyncSession, provider: str = "openai") -> OAuthCredential | None:
    result = await db.execute(
        select(OAuthCredential).where(OAuthCredential.provider == provider)
    )
    return result.scalar_one_or_none()


async def upsert_credential(
    db: AsyncSession,
    provider: str = "openai",
    *,
    access_token: str,
    refresh_token: str,
    id_token: str | None = None,
    account_id: str | None = None,
    plan_type: str | None = None,
    expires_at: datetime | None = None,
) -> OAuthCredential:
    cred = await get_credential(db, provider)
    if cred is None:
        cred = OAuthCredential(provider=provider)
        db.add(cred)
    cred.access_token = access_token
    cred.refresh_token = refresh_token
    cred.id_token = id_token
    cred.account_id = account_id
    cred.plan_type = plan_type
    cred.expires_at = expires_at
    await db.flush()
    return cred
