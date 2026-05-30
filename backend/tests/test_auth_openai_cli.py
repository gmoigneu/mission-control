import base64
import json
from datetime import UTC, datetime, timedelta

from app.agent.openai_auth import DeviceAuth, DeviceAuthorization, TokenSet
from app.agent.token_store import get_credential


def _jwt(acc: str) -> str:
    def seg(d: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

    return f"x.{seg({'https://api.openai.com/auth': {'chatgpt_account_id': acc}})}.s"


async def test_auth_openai_stores_credential(db, monkeypatch):
    from app import cli

    async def fake_request_device_code(http: object) -> DeviceAuth:
        return DeviceAuth(
            device_auth_id="dev_id_123",
            user_code="URZU-ONU28",
            interval=0,
            verification_uri="https://auth.openai.com/codex/device",
        )

    async def fake_poll_for_authorization(
        http: object, device: DeviceAuth, **kw: object
    ) -> DeviceAuthorization:
        return DeviceAuthorization(
            authorization_code="authcode_xyz",
            code_verifier="verifier_abc",
        )

    async def fake_exchange_authorization_code(
        http: object, code: str, code_verifier: str
    ) -> TokenSet:
        return TokenSet(
            access_token=_jwt("acc_cli"),
            refresh_token="R",
            id_token=None,
            account_id="acc_cli",
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            plan_type="plus",
        )

    monkeypatch.setattr(cli, "request_device_code", fake_request_device_code)
    monkeypatch.setattr(cli, "poll_for_authorization", fake_poll_for_authorization)
    monkeypatch.setattr(cli, "exchange_authorization_code", fake_exchange_authorization_code)

    # Patch db.commit to flush only — the test session uses savepoints so a real
    # commit would close the outer transaction that conftest relies on for rollback.
    monkeypatch.setattr(db, "commit", db.flush)

    import httpx

    async with httpx.AsyncClient() as http:
        await cli._auth_openai(http, db)

    cred = await get_credential(db, "openai")
    assert cred is not None
    assert cred.account_id == "acc_cli"
    assert cred.plan_type == "plus"


async def test_auth_status_no_credential(db, capsys):
    from app import cli

    await cli._auth_status(db)
    out = capsys.readouterr().out
    assert "auth-openai" in out


async def test_auth_status_with_credential(db, capsys, monkeypatch):
    from app import cli
    from app.agent.token_store import upsert_credential

    await upsert_credential(
        db,
        "openai",
        access_token=_jwt("acc_status"),
        refresh_token="R",
        account_id="acc_status",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    await db.flush()

    await cli._auth_status(db)
    out = capsys.readouterr().out
    assert "acc_status" in out
