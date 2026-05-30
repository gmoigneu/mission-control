import base64
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.agent import openai_auth
from app.agent.openai_auth import (
    account_id_and_expiry,
    ensure_fresh,
    poll_for_token,
    request_device_code,
)
from app.agent.token_store import upsert_credential


def _jwt(claims: dict) -> str:
    def seg(d: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

    return f"{seg({'alg': 'none'})}.{seg(claims)}.sig"


def test_account_id_and_expiry_from_jwt():
    exp = int((datetime.now(UTC) + timedelta(hours=1)).timestamp())
    token = _jwt({"https://api.openai.com/auth": {"chatgpt_account_id": "acc_42"}, "exp": exp})
    account_id, expires_at = account_id_and_expiry(token)
    assert account_id == "acc_42"
    assert expires_at is not None


async def test_request_device_code_parses_response():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "device_code": "DEV",
                "user_code": "ABCD-1234",
                "verification_uri": "https://auth.openai.com/device",
                "interval": 5,
                "expires_in": 900,
            },
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    dc = await request_device_code(http)
    assert dc.device_code == "DEV"
    assert dc.user_code == "ABCD-1234"


async def test_poll_for_token_handles_pending_then_success():
    calls = {"n": 0}
    access = _jwt(
        {
            "https://api.openai.com/auth": {"chatgpt_account_id": "acc_9"},
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 2:
            return httpx.Response(400, json={"error": "authorization_pending"})
        return httpx.Response(200, json={"access_token": access, "refresh_token": "R"})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    dc = openai_auth.DeviceCode("DEV", "ABCD-1234", "uri", interval=0, expires_in=30)

    async def no_sleep(_):
        return None

    ts = await poll_for_token(http, dc, sleep=no_sleep)
    assert ts.account_id == "acc_9"
    assert ts.refresh_token == "R"


async def test_ensure_fresh_refreshes_when_expired(db):
    new_access = _jwt(
        {
            "https://api.openai.com/auth": {"chatgpt_account_id": "acc_new"},
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"access_token": new_access, "refresh_token": "R2"})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await upsert_credential(
        db,
        "openai",
        access_token="old",
        refresh_token="R1",
        account_id="acc_old",
        expires_at=datetime.now(UTC) - timedelta(minutes=5),  # expired
    )
    access, account_id = await ensure_fresh(db, http)
    assert account_id == "acc_new"
    assert access == new_access


async def test_ensure_fresh_raises_without_credential(db):
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})))
    with pytest.raises(RuntimeError, match="auth-openai"):
        await ensure_fresh(db, http)
