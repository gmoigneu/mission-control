from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import AppUser
from app.security import verify_password


async def get_user_by_email(db: AsyncSession, email: str) -> AppUser | None:
    result = await db.execute(select(AppUser).where(AppUser.email == email))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> AppUser | None:
    user = await get_user_by_email(db, email)
    if user is None or user.password_hash is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
