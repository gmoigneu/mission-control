import base64
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.agent.openai_auth import (
    DeviceAuth,
    DeviceAuthorization,
    account_id_and_expiry,
    ensure_fresh,
    exchange_authorization_code,
    poll_for_authorization,
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
    """request_device_code parses string interval and uses verification_uri from settings."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "device_auth_id": "dev_abc",
                "user_code": "URZU-ONU28",
                "interval": "5",  # returned as a string by the real endpoint
                "expires_at": "2026-05-30T12:00:00Z",
            },
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    dc = await request_device_code(http)
    assert dc.device_auth_id == "dev_abc"
    assert dc.user_code == "URZU-ONU28"
    assert dc.interval == 5  # string → int
    assert dc.verification_uri == "https://auth.openai.com/codex/device"


async def test_request_device_code_raises_on_404():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError, match="not enabled"):
        await request_device_code(http)


async def test_poll_for_authorization_pending_then_success():
    """pending (403) followed by a success (200) returns a DeviceAuthorization."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 2:
            return httpx.Response(403)
        return httpx.Response(
            200,
            json={"authorization_code": "authcode_xyz", "code_verifier": "verifier_abc"},
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    device = DeviceAuth("dev_id", "URZU-ONU28", interval=0, verification_uri="https://auth.openai.com/codex/device")

    async def no_sleep(_: float) -> None:
        return None

    result = await poll_for_authorization(http, device, sleep=no_sleep)
    assert isinstance(result, DeviceAuthorization)
    assert result.authorization_code == "authcode_xyz"
    assert result.code_verifier == "verifier_abc"


async def test_poll_for_authorization_pending_via_error_code():
    """error.code == 'deviceauth_authorization_pending' is treated as pending."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 2:
            return httpx.Response(
                400,
                json={"error": {"code": "deviceauth_authorization_pending"}},
            )
        return httpx.Response(
            200,
            json={"authorization_code": "authcode_xyz", "code_verifier": "verifier_abc"},
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    device = DeviceAuth("dev_id", "URZU-ONU28", interval=0, verification_uri="https://auth.openai.com/codex/device")

    async def no_sleep(_: float) -> None:
        return None

    result = await poll_for_authorization(http, device, sleep=no_sleep)
    assert result.authorization_code == "authcode_xyz"


async def test_poll_for_authorization_slow_down_increases_interval():
    """slow_down must increase the poll interval by 5 seconds."""
    calls = {"n": 0}
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(400, json={"error": {"code": "slow_down"}})
        return httpx.Response(
            200,
            json={"authorization_code": "authcode_xyz", "code_verifier": "verifier_abc"},
        )

    async def record_sleep(secs: float) -> None:
        sleeps.append(secs)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    device = DeviceAuth("dev_id", "URZU-ONU28", interval=5, verification_uri="https://auth.openai.com/codex/device")
    result = await poll_for_authorization(http, device, sleep=record_sleep)
    assert result.authorization_code == "authcode_xyz"
    # After slow_down the interval increases by 5 (5 → 10); next sleep must be 10
    assert sleeps[0] == 10


async def test_exchange_authorization_code_posts_correct_grant():
    """exchange_authorization_code posts form-urlencoded and returns a TokenSet with account_id."""
    access = _jwt(
        {
            "https://api.openai.com/auth": {"chatgpt_account_id": "acc_ex"},
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
    )
    received: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        received["content_type"] = request.headers.get("content-type", "")
        received["body"] = dict(
            pair.split("=", 1)
            for pair in request.content.decode().split("&")
            if "=" in pair
        )
        return httpx.Response(
            200,
            json={"access_token": access, "refresh_token": "R_ex", "expires_in": 3600},
        )

    from urllib.parse import unquote_plus

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    ts = await exchange_authorization_code(http, "authcode_xyz", "verifier_abc")

    assert "application/x-www-form-urlencoded" in received["content_type"]
    assert received["body"]["grant_type"] == "authorization_code"
    assert received["body"]["code"] == "authcode_xyz"
    assert received["body"]["code_verifier"] == "verifier_abc"
    assert unquote_plus(received["body"]["redirect_uri"]) == "https://auth.openai.com/deviceauth/callback"
    assert ts.account_id == "acc_ex"
    assert ts.refresh_token == "R_ex"
    assert ts.expires_at is not None


async def test_ensure_fresh_refreshes_when_expired(db):
    new_access = _jwt(
        {
            "https://api.openai.com/auth": {"chatgpt_account_id": "acc_new"},
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"access_token": new_access, "refresh_token": "R2", "expires_in": 3600}
        )

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


async def test_ensure_fresh_no_refresh_when_valid(db):
    """When the token is still valid, ensure_fresh must NOT call the refresh endpoint."""
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, json={})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    valid_access = _jwt(
        {
            "https://api.openai.com/auth": {"chatgpt_account_id": "acc_valid"},
            "exp": int((datetime.now(UTC) + timedelta(hours=2)).timestamp()),
        }
    )
    await upsert_credential(
        db,
        "openai",
        access_token=valid_access,
        refresh_token="R_valid",
        account_id="acc_valid",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    access, account_id = await ensure_fresh(db, http)
    assert access == valid_access
    assert account_id == "acc_valid"
    assert calls == [], "refresh endpoint must not be called when token is still valid"
