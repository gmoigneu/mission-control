from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.user import AppUser
from app.schemas.auth import LoginRequest, UserOut
from app.services.auth import authenticate_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):  # noqa: B008
    user = await authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    # Prevent session fixation: drop any pre-auth session contents so a session
    # id/cookie established before login cannot be replayed with elevated rights.
    request.session.clear()
    request.session["user_id"] = str(user.id)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request) -> None:
    # Clear the session so the post-logout cookie can no longer authenticate.
    request.session.clear()


@router.get("/me", response_model=UserOut)
async def me(user: AppUser = Depends(get_current_user)) -> AppUser:  # noqa: B008
    return user
