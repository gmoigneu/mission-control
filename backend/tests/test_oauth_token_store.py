from datetime import UTC, datetime

from app.agent.token_store import get_credential, upsert_credential


async def test_upsert_then_get(db):
    assert await get_credential(db, "openai") is None
    exp = datetime(2026, 6, 1, tzinfo=UTC)
    await upsert_credential(
        db, "openai", access_token="a", refresh_token="r", account_id="acc_1", expires_at=exp
    )
    cred = await get_credential(db, "openai")
    assert cred is not None
    assert cred.access_token == "a"
    assert cred.account_id == "acc_1"


async def test_upsert_is_idempotent_single_row(db):
    await upsert_credential(db, "openai", access_token="a1", refresh_token="r1")
    await upsert_credential(db, "openai", access_token="a2", refresh_token="r2")
    cred = await get_credential(db, "openai")
    assert cred.access_token == "a2"
    from sqlalchemy import func, select

    from app.models.oauth_credential import OAuthCredential

    count = (await db.execute(select(func.count()).select_from(OAuthCredential))).scalar_one()
    assert count == 1
