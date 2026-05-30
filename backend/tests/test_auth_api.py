import json
from base64 import b64encode

import itsdangerous

from app.config import settings
from app.models.user import AppUser
from app.security import hash_password


async def _seed(db, email="g@example.com", password="hunter2"):
    db.add(AppUser(email=email, password_hash=hash_password(password)))
    await db.flush()


def _sign_session(data: dict) -> str:
    """Forge a signed session cookie the way Starlette's SessionMiddleware does."""
    signer = itsdangerous.TimestampSigner(settings.session_secret)
    payload = b64encode(json.dumps(data).encode("utf-8"))
    return signer.sign(payload).decode("utf-8")


async def test_me_requires_auth(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_login_then_me(client, db):
    await _seed(db)
    login = await client.post("/auth/login", json={"email": "g@example.com", "password": "hunter2"})
    assert login.status_code == 200
    assert login.json()["email"] == "g@example.com"

    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "g@example.com"


async def test_login_bad_password(client, db):
    await _seed(db)
    resp = await client.post("/auth/login", json={"email": "g@example.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_logout_clears_session(client, db):
    await _seed(db)
    await client.post("/auth/login", json={"email": "g@example.com", "password": "hunter2"})
    logout = await client.post("/auth/logout")
    assert logout.status_code == 204
    me = await client.get("/auth/me")
    assert me.status_code == 401


async def test_login_drops_pre_auth_session(client, db):
    """Session fixation: a session value planted before login must not survive it."""
    await _seed(db)
    # Attacker plants a pre-auth session cookie in the victim's browser.
    client.cookies.set("session", _sign_session({"fixated": "attacker"}))

    login = await client.post(
        "/auth/login", json={"email": "g@example.com", "password": "hunter2"}
    )
    assert login.status_code == 200

    # The cookie value must rotate on login (the pre-auth cookie is no longer valid).
    set_cookie = login.headers.get("set-cookie", "")
    assert "session=" in set_cookie
    assert "fixated" not in set_cookie

    # The pre-auth key is gone; only the authenticated identity remains usable.
    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "g@example.com"


async def test_login_rotates_session_cookie(client, db):
    """The session cookie issued on login differs from any pre-auth cookie value."""
    await _seed(db)
    stale = _sign_session({"fixated": "attacker"})
    client.cookies.set("session", stale)

    login = await client.post(
        "/auth/login", json={"email": "g@example.com", "password": "hunter2"}
    )
    assert login.status_code == 200
    assert stale not in login.headers.get("set-cookie", "")
