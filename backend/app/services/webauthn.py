"""WebAuthn (passkey) registration and assertion service.

The ``webauthn`` (py_webauthn) library is imported lazily inside each helper so
that importing this module never hard-requires the dependency. This keeps test
collection and the rest of the application working when the extra is absent or
mocked.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.user import AppUser

REGISTRATION_CHALLENGE_COOKIE = "mc_webauthn_reg"
ASSERTION_CHALLENGE_COOKIE = "mc_webauthn_auth"
CHALLENGE_MAX_AGE = 300


def _b64url(data: bytes) -> str:
    return urlsafe_b64encode(data).decode().rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return urlsafe_b64decode(padded)


def _sign(value: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), value.encode(), hashlib.sha256).digest()
    return urlsafe_b64encode(digest).decode().rstrip("=")


def _store_challenge(
    response: Response, *, cookie: str, challenge: bytes, settings: Settings
) -> None:
    payload = {"c": _b64url(challenge), "iat": int(time.time())}
    raw = _b64url(json.dumps(payload).encode())
    token = f"{raw}.{_sign(raw, settings.session_secret)}"
    response.set_cookie(
        cookie,
        token,
        max_age=CHALLENGE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )


def _read_challenge(request: Request, *, cookie: str, settings: Settings) -> bytes:
    token = request.cookies.get(cookie)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing or expired challenge",
        )
    try:
        raw, sig = token.rsplit(".", 1)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid challenge",
        ) from exc
    if not hmac.compare_digest(sig, _sign(raw, settings.session_secret)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid challenge",
        )
    try:
        payload = json.loads(_b64url_decode(raw))
        return _b64url_decode(payload["c"])
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid challenge",
        ) from exc


def _clear_challenge(response: Response, *, cookie: str) -> None:
    response.delete_cookie(cookie, path="/")


def _existing_credentials(user: AppUser) -> list[dict]:
    return list(user.webauthn_credentials or [])


async def get_single_user(session: AsyncSession) -> AppUser:
    """Return the single application user, or 404 when not provisioned."""
    result = await session.execute(select(AppUser).order_by(AppUser.created_at))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user available",
        )
    return user


def begin_registration(response: Response, *, user: AppUser, settings: Settings) -> dict:
    from webauthn import generate_registration_options, options_to_json
    from webauthn.helpers.structs import (
        PublicKeyCredentialDescriptor,
        ResidentKeyRequirement,
    )

    exclude = [
        PublicKeyCredentialDescriptor(id=_b64url_decode(cred["id"]))
        for cred in _existing_credentials(user)
    ]
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.email,
        exclude_credentials=exclude,
        resident_key_requirement=ResidentKeyRequirement.PREFERRED,
    )
    _store_challenge(
        response,
        cookie=REGISTRATION_CHALLENGE_COOKIE,
        challenge=options.challenge,
        settings=settings,
    )
    return json.loads(options_to_json(options))


async def complete_registration(
    request: Request,
    response: Response,
    *,
    user: AppUser,
    credential: dict,
    session: AsyncSession,
    settings: Settings,
) -> None:
    from webauthn import verify_registration_response

    challenge = _read_challenge(
        request, cookie=REGISTRATION_CHALLENGE_COOKIE, settings=settings
    )
    try:
        verification = verify_registration_response(
            credential=json.dumps(credential),
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
        )
    except Exception as exc:  # noqa: BLE001 - library raises various errors
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passkey registration failed",
        ) from exc

    stored = _existing_credentials(user)
    stored.append(
        {
            "id": _b64url(verification.credential_id),
            "public_key": _b64url(verification.credential_public_key),
            "sign_count": verification.sign_count,
        }
    )
    user.webauthn_credentials = stored
    session.add(user)
    await session.commit()
    _clear_challenge(response, cookie=REGISTRATION_CHALLENGE_COOKIE)


def begin_assertion(response: Response, *, user: AppUser, settings: Settings) -> dict:
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers.structs import PublicKeyCredentialDescriptor

    allow = [
        PublicKeyCredentialDescriptor(id=_b64url_decode(cred["id"]))
        for cred in _existing_credentials(user)
    ]
    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        allow_credentials=allow,
    )
    _store_challenge(
        response,
        cookie=ASSERTION_CHALLENGE_COOKIE,
        challenge=options.challenge,
        settings=settings,
    )
    return json.loads(options_to_json(options))


async def complete_assertion(
    request: Request,
    response: Response,
    *,
    user: AppUser,
    credential: dict,
    session: AsyncSession,
    settings: Settings,
) -> AppUser:
    from webauthn import verify_authentication_response

    challenge = _read_challenge(
        request, cookie=ASSERTION_CHALLENGE_COOKIE, settings=settings
    )
    raw_id = credential.get("id") or credential.get("rawId")
    stored = _existing_credentials(user)
    matched = next((c for c in stored if c["id"] == raw_id), None)
    if matched is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unknown passkey",
        )
    try:
        verification = verify_authentication_response(
            credential=json.dumps(credential),
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            credential_public_key=_b64url_decode(matched["public_key"]),
            credential_current_sign_count=matched.get("sign_count", 0),
        )
    except Exception as exc:  # noqa: BLE001 - library raises various errors
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Passkey authentication failed",
        ) from exc

    matched["sign_count"] = verification.new_sign_count
    user.webauthn_credentials = stored
    session.add(user)
    await session.commit()
    _clear_challenge(response, cookie=ASSERTION_CHALLENGE_COOKIE)
    return user
