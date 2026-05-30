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
