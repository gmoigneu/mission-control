import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn.helpers import base64url_to_bytes
from webauthn.helpers.exceptions import (
    InvalidAuthenticationResponse,
    InvalidRegistrationResponse,
)

from app.db import get_db
from app.deps import get_current_user
from app.models.user import AppUser
from app.models.webauthn_credential import WebAuthnCredential
from app.schemas.auth import UserOut
from app.schemas.webauthn import (
    AuthenticationVerifyRequest,
    PasskeyOut,
    RegistrationVerifyRequest,
)
from app.services import webauthn as webauthn_service

router = APIRouter(prefix="/auth/webauthn", tags=["auth", "webauthn"])

_REG_CHALLENGE_KEY = "webauthn_register_challenge"
_AUTH_CHALLENGE_KEY = "webauthn_auth_challenge"


@router.get("/passkeys", response_model=list[PasskeyOut])
async def list_passkeys(
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> list[WebAuthnCredential]:
    result = await db.execute(
        select(WebAuthnCredential)
        .where(WebAuthnCredential.user_id == user.id)
        .order_by(WebAuthnCredential.created_at)
    )
    return list(result.scalars().all())


@router.delete("/passkeys/{passkey_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passkey(
    passkey_id: uuid.UUID,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> None:
    record = await db.get(WebAuthnCredential, passkey_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passkey not found")
    await db.delete(record)
    await db.commit()


@router.post("/register/options")
async def registration_options(
    request: Request,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    options, challenge = await webauthn_service.build_registration_options(db, user)
    request.session[_REG_CHALLENGE_KEY] = webauthn_service.challenge_to_session(challenge)
    return options


@router.post("/register/verify", response_model=PasskeyOut)
async def registration_verify(
    payload: RegistrationVerifyRequest,
    request: Request,
    user: AppUser = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> WebAuthnCredential:
    stored = request.session.pop(_REG_CHALLENGE_KEY, None)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No registration in progress"
        )
    try:
        record = await webauthn_service.verify_registration(
            db,
            user,
            credential=payload.credential,
            challenge=base64url_to_bytes(stored),
            name=payload.name,
        )
    except InvalidRegistrationResponse as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Passkey registration failed"
        ) from exc
    await db.commit()
    return record


@router.post("/authenticate/options")
async def authentication_options(
    request: Request,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    options, challenge = await webauthn_service.build_authentication_options(db)
    request.session[_AUTH_CHALLENGE_KEY] = webauthn_service.challenge_to_session(challenge)
    return options


@router.post("/authenticate/verify", response_model=UserOut)
async def authentication_verify(
    payload: AuthenticationVerifyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AppUser:
    stored = request.session.pop(_AUTH_CHALLENGE_KEY, None)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No authentication in progress"
        )
    try:
        user = await webauthn_service.verify_authentication(
            db,
            credential=payload.credential,
            challenge=base64url_to_bytes(stored),
        )
    except InvalidAuthenticationResponse as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid passkey"
        ) from exc
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid passkey"
        )
    await db.commit()
    request.session.clear()
    request.session["user_id"] = str(user.id)
    return user
