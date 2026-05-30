"""WebAuthn / passkey service.

Wraps py_webauthn to issue registration/authentication options and verify the
authenticator responses, persisting credentials for the single application user.
Challenges are short-lived and round-tripped through the session cookie.
"""
from __future__ import annotations

import json
import uuid

from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import settings
from app.models.user import AppUser
from app.models.webauthn_credential import WebAuthnCredential


async def _list_credentials(db: AsyncSession, user_id: uuid.UUID) -> list[WebAuthnCredential]:
    result = await db.execute(
        select(WebAuthnCredential)
        .where(WebAuthnCredential.user_id == user_id)
        .order_by(WebAuthnCredential.created_at)
    )
    return list(result.scalars().all())


async def get_credential_by_id(
    db: AsyncSession, credential_id: bytes
) -> WebAuthnCredential | None:
    result = await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
    )
    return result.scalar_one_or_none()


async def build_registration_options(db: AsyncSession, user: AppUser) -> tuple[dict, bytes]:
    """Return (options_json, challenge) for navigator.credentials.create()."""
    existing = await _list_credentials(db, user.id)
    exclude = [
        PublicKeyCredentialDescriptor(id=cred.credential_id) for cred in existing
    ]
    options = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=user.id.bytes,
        user_name=user.email,
        user_display_name=user.name or user.email,
        exclude_credentials=exclude or None,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    return json.loads(options_to_json(options)), options.challenge


async def verify_registration(
    db: AsyncSession,
    user: AppUser,
    *,
    credential: dict,
    challenge: bytes,
    name: str | None,
) -> WebAuthnCredential:
    """Verify a registration response and persist the new credential."""
    verification = verify_registration_response(
        credential=credential,
        expected_challenge=challenge,
        expected_rp_id=settings.webauthn_rp_id,
        expected_origin=settings.webauthn_rp_origin,
    )
    transports = credential.get("response", {}).get("transports")
    record = WebAuthnCredential(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=",".join(transports) if transports else None,
        name=name,
    )
    db.add(record)
    await db.flush()
    return record


async def build_authentication_options(db: AsyncSession) -> tuple[dict, bytes]:
    """Return (options_json, challenge) for navigator.credentials.get().

    Credentials are scoped to the single application user; we surface every
    registered passkey via allow_credentials so the browser can pick one.
    """
    result = await db.execute(select(WebAuthnCredential))
    creds = list(result.scalars().all())
    allow = [PublicKeyCredentialDescriptor(id=c.credential_id) for c in creds]
    options = generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        allow_credentials=allow or None,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    return json.loads(options_to_json(options)), options.challenge


async def verify_authentication(
    db: AsyncSession,
    *,
    credential: dict,
    challenge: bytes,
) -> AppUser | None:
    """Verify an authentication response; return the owning user on success."""
    raw_id = credential.get("rawId") or credential.get("id")
    if not raw_id:
        return None
    record = await get_credential_by_id(db, base64url_to_bytes(raw_id))
    if record is None:
        return None
    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=challenge,
        expected_rp_id=settings.webauthn_rp_id,
        expected_origin=settings.webauthn_rp_origin,
        credential_public_key=record.public_key,
        credential_current_sign_count=record.sign_count,
    )
    record.sign_count = verification.new_sign_count
    record.last_used_at = sa_func.now()
    await db.flush()
    return await db.get(AppUser, record.user_id)


def challenge_to_session(challenge: bytes) -> str:
    return bytes_to_base64url(challenge)
