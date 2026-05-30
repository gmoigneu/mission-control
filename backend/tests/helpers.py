from app.models.user import AppUser
from app.security import hash_password


async def login(client, db, *, email: str = "g@example.com", password: str = "pw") -> None:
    db.add(AppUser(email=email, password_hash=hash_password(password)))
    await db.flush()
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
