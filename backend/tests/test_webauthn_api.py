"""Tests for the WebAuthn (passkey) API routes.

The py_webauthn library is fully mocked through ``sys.modules`` so the suite runs
offline with no real crypto, network, or extra dependency installed.
"""

from __future__ import annotations

import sys
import types
from base64 import urlsafe_b64encode
from dataclasses import dataclass

import pytest


def _b64url(data: bytes) -> str:
    return urlsafe_b64encode(data).decode().rstrip("=")


CHALLENGE = b"test-challenge-bytes"
CRED_ID = b"credential-id-bytes"
PUBLIC_KEY = b"public-key-bytes"


@dataclass
class _FakeOptions:
    challenge: bytes


@dataclass
class _FakeRegistrationVerification:
    credential_id: bytes
    credential_public_key: bytes
    sign_count: int


@dataclass
class _FakeAuthenticationVerification:
    new_sign_count: int


@pytest.fixture(autouse=True)
def fake_webauthn(monkeypatch):
    """Install a fake ``webauthn`` package into sys.modules."""
    module = types.ModuleType("webauthn")
    helpers = types.ModuleType("webauthn.helpers")
    structs = types.ModuleType("webauthn.helpers.structs")

    @dataclass
    class PublicKeyCredentialDescriptor:
        id: bytes

    class ResidentKeyRequirement:
        PREFERRED = "preferred"

    structs.PublicKeyCredentialDescriptor = PublicKeyCredentialDescriptor
    structs.ResidentKeyRequirement = ResidentKeyRequirement

    def generate_registration_options(**_kwargs):
        return _FakeOptions(challenge=CHALLENGE)

    def generate_authentication_options(**_kwargs):
        return _FakeOptions(challenge=CHALLENGE)

    def options_to_json(options):
        import json

        return json.dumps({"challenge": _b64url(options.challenge)})

    def verify_registration_response(**_kwargs):
        return _FakeRegistrationVerification(
            credential_id=CRED_ID,
            credential_public_key=PUBLIC_KEY,
            sign_count=0,
        )

    def verify_authentication_response(**_kwargs):
        return _FakeAuthenticationVerification(new_sign_count=5)

    module.generate_registration_options = generate_registration_options
    module.generate_authentication_options = generate_authentication_options
    module.options_to_json = options_to_json
    module.verify_registration_response = verify_registration_response
    module.verify_authentication_response = verify_authentication_response
    module.helpers = helpers
    helpers.structs = structs

    monkeypatch.setitem(sys.modules, "webauthn", module)
    monkeypatch.setitem(sys.modules, "webauthn.helpers", helpers)
    monkeypatch.setitem(sys.modules, "webauthn.helpers.structs", structs)
    yield


async def _login(client):
    return await client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "correct horse"},
    )


@pytest.mark.asyncio
async def test_register_begin_requires_auth(client, user):
    resp = await client.post("/auth/webauthn/register/begin")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_register_flow(client, user):
    login = await _login(client)
    cookies = login.cookies

    begin = await client.post("/auth/webauthn/register/begin", cookies=cookies)
    assert begin.status_code == 200
    assert "challenge" in begin.json()
    assert "mc_webauthn_reg" in begin.cookies

    cookies.update(begin.cookies)
    complete = await client.post(
        "/auth/webauthn/register/complete",
        json={"credential": {"id": "abc", "response": {}}},
        cookies=cookies,
    )
    assert complete.status_code == 204


@pytest.mark.asyncio
async def test_register_complete_missing_challenge(client, user):
    login = await _login(client)
    complete = await client.post(
        "/auth/webauthn/register/complete",
        json={"credential": {"id": "abc"}},
        cookies=login.cookies,
    )
    assert complete.status_code == 400


@pytest.mark.asyncio
async def test_login_flow(client, user, session_factory):
    # Seed a stored credential matching the fake verification output.
    from sqlalchemy import select

    from app.models.user import AppUser

    async with session_factory() as session:
        result = await session.execute(select(AppUser))
        seeded = result.scalar_one()
        seeded.webauthn_credentials = [
            {
                "id": _b64url(CRED_ID),
                "public_key": _b64url(PUBLIC_KEY),
                "sign_count": 0,
            }
        ]
        session.add(seeded)
        await session.commit()

    begin = await client.post("/auth/webauthn/login/begin")
    assert begin.status_code == 200
    assert "challenge" in begin.json()
    assert "mc_webauthn_auth" in begin.cookies

    complete = await client.post(
        "/auth/webauthn/login/complete",
        json={"credential": {"id": _b64url(CRED_ID), "response": {}}},
        cookies=begin.cookies,
    )
    assert complete.status_code == 200
    assert complete.json()["email"] == "admin@example.com"
    assert "mc_session" in complete.cookies


@pytest.mark.asyncio
async def test_login_unknown_credential(client, user):
    begin = await client.post("/auth/webauthn/login/begin")
    complete = await client.post(
        "/auth/webauthn/login/complete",
        json={"credential": {"id": "unknown", "response": {}}},
        cookies=begin.cookies,
    )
    assert complete.status_code == 401
