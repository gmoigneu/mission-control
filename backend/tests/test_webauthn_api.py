from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.models.user import AppUser
from app.models.webauthn_credential import WebAuthnCredential
from app.services import webauthn as webauthn_service
from tests.helpers import login


async def test_register_options_requires_auth(client):
    resp = await client.post("/auth/webauthn/register/options")
    assert resp.status_code == 401


async def test_register_options_returns_publickey_params(client, db):
    await login(client, db)
    resp = await client.post("/auth/webauthn/register/options")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rp"]["id"] == "localhost"
    assert "challenge" in body
    assert body["user"]["name"] == "g@example.com"


async def test_register_verify_persists_credential(client, db, monkeypatch):
    await login(client, db)
    # Issue options so the challenge is stored in the session cookie.
    opts = await client.post("/auth/webauthn/register/options")
    assert opts.status_code == 200

    def fake_verify(**kwargs):
        return SimpleNamespace(
            credential_id=b"cred-bytes",
            credential_public_key=b"pub-bytes",
            sign_count=0,
        )

    monkeypatch.setattr(webauthn_service, "verify_registration_response", fake_verify)

    resp = await client.post(
        "/auth/webauthn/register/verify",
        json={
            "credential": {"id": "abc", "response": {"transports": ["internal"]}},
            "name": "MacBook",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "MacBook"

    count = (await db.execute(select(func.count()).select_from(WebAuthnCredential))).scalar_one()
    assert count == 1
    record = (await db.execute(select(WebAuthnCredential))).scalar_one()
    assert record.credential_id == b"cred-bytes"
    assert record.transports == "internal"


async def test_register_verify_without_options_fails(client, db):
    await login(client, db)
    resp = await client.post(
        "/auth/webauthn/register/verify",
        json={"credential": {"id": "abc"}, "name": None},
    )
    assert resp.status_code == 400


async def test_list_and_delete_passkeys(client, db):
    await login(client, db)
    user = (await db.execute(select(AppUser))).scalar_one()
    cred = WebAuthnCredential(
        user_id=user.id,
        credential_id=b"raw-cred",
        public_key=b"pub",
        sign_count=0,
        name="Phone",
    )
    db.add(cred)
    await db.flush()

    listing = await client.get("/auth/webauthn/passkeys")
    assert listing.status_code == 200
    rows = listing.json()
    assert len(rows) == 1
    assert rows[0]["name"] == "Phone"

    deleted = await client.delete(f"/auth/webauthn/passkeys/{rows[0]['id']}")
    assert deleted.status_code == 204
    remaining = (
        await db.execute(select(func.count()).select_from(WebAuthnCredential))
    ).scalar_one()
    assert remaining == 0


async def test_authenticate_options_returns_challenge(client, db):
    resp = await client.post("/auth/webauthn/authenticate/options")
    assert resp.status_code == 200
    assert "challenge" in resp.json()


async def test_authenticate_verify_logs_in(client, db, monkeypatch):
    # Seed a user + a passkey whose rawId matches the response credential.
    user = AppUser(email="g@example.com")
    db.add(user)
    await db.flush()
    from webauthn.helpers import bytes_to_base64url

    raw_id = b"login-cred"
    db.add(
        WebAuthnCredential(
            user_id=user.id, credential_id=raw_id, public_key=b"pub", sign_count=3
        )
    )
    await db.flush()

    opts = await client.post("/auth/webauthn/authenticate/options")
    assert opts.status_code == 200

    def fake_verify(**kwargs):
        return SimpleNamespace(new_sign_count=4)

    monkeypatch.setattr(webauthn_service, "verify_authentication_response", fake_verify)

    resp = await client.post(
        "/auth/webauthn/authenticate/verify",
        json={"credential": {"id": "x", "rawId": bytes_to_base64url(raw_id)}},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "g@example.com"

    # Session is now authenticated.
    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "g@example.com"


async def test_authenticate_verify_unknown_credential(client, db):
    opts = await client.post("/auth/webauthn/authenticate/options")
    assert opts.status_code == 200
    from webauthn.helpers import bytes_to_base64url

    resp = await client.post(
        "/auth/webauthn/authenticate/verify",
        json={"credential": {"id": "x", "rawId": bytes_to_base64url(b"nope")}},
    )
    assert resp.status_code == 401


@pytest.mark.parametrize("path", ["register/options", "register/verify"])
async def test_register_endpoints_require_auth(client, path):
    json_body = {} if path.endswith("options") else {"credential": {"id": "x"}}
    resp = await client.post(f"/auth/webauthn/{path}", json=json_body)
    assert resp.status_code == 401
