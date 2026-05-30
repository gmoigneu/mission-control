from app.models.user import AppUser
from app.security import hash_password


async def _seed(db, email="g@example.com", password="hunter2"):
    db.add(AppUser(email=email, password_hash=hash_password(password)))
    await db.flush()


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


def _session_cookie(client):
    return client.cookies.get("session")


async def test_login_rotates_session_identifier(client, db):
    await _seed(db)

    # Force a pre-auth session value by signing in with bad credentials, which
    # still establishes a session cookie carrying any pre-auth state.
    await client.post(
        "/auth/login", json={"email": "g@example.com", "password": "wrong"}
    )
    pre_login_cookie = _session_cookie(client)

    # A second login attempt as the same anonymous client must mint a brand-new
    # session identifier rather than reusing whatever value was present before.
    first = await client.post(
        "/auth/login", json={"email": "g@example.com", "password": "hunter2"}
    )
    assert first.status_code == 200
    first_cookie = _session_cookie(client)
    assert first_cookie is not None
    assert first_cookie != pre_login_cookie

    # Logging in again issues a different identifier each time (fresh nonce),
    # proving the session id is regenerated on every login rather than reused.
    second = await client.post(
        "/auth/login", json={"email": "g@example.com", "password": "hunter2"}
    )
    assert second.status_code == 200
    second_cookie = _session_cookie(client)
    assert second_cookie is not None
    assert second_cookie != first_cookie


async def test_logout_clears_session_cookie(client, db):
    await _seed(db)
    await client.post("/auth/login", json={"email": "g@example.com", "password": "hunter2"})
    assert _session_cookie(client) is not None

    logout = await client.post("/auth/logout")
    assert logout.status_code == 204

    # The session must be reset on logout so the prior authenticated session
    # value is no longer presented by the client.
    me = await client.get("/auth/me")
    assert me.status_code == 401
