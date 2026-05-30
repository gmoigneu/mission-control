import asyncio
import base64
import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.token_store import get_credential, upsert_credential
from app.config import settings

_SCOPE = "openid profile email offline_access"


@dataclass
class DeviceCode:
    device_code: str
    user_code: str
    verification_uri: str
    interval: int
    expires_in: int


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str
    id_token: str | None
    account_id: str | None
    expires_at: datetime | None
    plan_type: str | None


def _decode_jwt_claims(token: str) -> dict:
    """Decode a JWT payload WITHOUT verification (we only read our own token's claims)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


def account_id_and_expiry(access_token: str) -> tuple[str | None, datetime | None]:
    claims = _decode_jwt_claims(access_token)
    auth = claims.get("https://api.openai.com/auth", {}) or {}
    account_id = auth.get("chatgpt_account_id")
    exp = claims.get("exp")
    expires_at = datetime.fromtimestamp(exp, tz=UTC) if exp else None
    return account_id, expires_at


def _token_set(data: dict, *, fallback_refresh: str = "") -> TokenSet:
    access = data["access_token"]
    account_id, expires_at = account_id_and_expiry(access)
    return TokenSet(
        access_token=access,
        refresh_token=data.get("refresh_token") or fallback_refresh,
        id_token=data.get("id_token"),
        account_id=account_id,
        expires_at=expires_at,
        plan_type=data.get("chatgpt_plan_type"),
    )


async def request_device_code(http: httpx.AsyncClient) -> DeviceCode:
    # NOTE: confirm the exact device-authorization path against the Codex source in the live smoke.
    resp = await http.post(
        f"{settings.openai_auth_base_url}/oauth/device/code",
        data={"client_id": settings.openai_oauth_client_id, "scope": _SCOPE},
    )
    resp.raise_for_status()
    d = resp.json()
    return DeviceCode(
        device_code=d["device_code"],
        user_code=d["user_code"],
        verification_uri=(
            d.get("verification_uri_complete")
            or d.get("verification_uri")
            or f"{settings.openai_auth_base_url}/device"
        ),
        interval=int(d.get("interval", 5)),
        expires_in=int(d.get("expires_in", 900)),
    )


async def poll_for_token(
    http: httpx.AsyncClient,
    device: DeviceCode,
    *,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    now: Callable[[], float] = time.monotonic,
) -> TokenSet:
    deadline = now() + device.expires_in
    interval = device.interval
    while now() < deadline:
        resp = await http.post(
            f"{settings.openai_auth_base_url}/oauth/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": device.device_code,
                "client_id": settings.openai_oauth_client_id,
            },
        )
        if resp.status_code == 200:
            return _token_set(resp.json())
        err = (resp.json() or {}).get("error") if resp.content else None
        if err == "authorization_pending":
            pass
        elif err == "slow_down":
            interval += 5
        elif err in ("expired_token", "access_denied"):
            raise RuntimeError(f"Device authorization failed: {err}")
        else:
            resp.raise_for_status()
        await sleep(interval)
    raise RuntimeError("Device authorization timed out")


async def refresh(http: httpx.AsyncClient, refresh_token: str) -> TokenSet:
    resp = await http.post(
        f"{settings.openai_auth_base_url}/oauth/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": settings.openai_oauth_client_id,
        },
    )
    resp.raise_for_status()
    return _token_set(resp.json(), fallback_refresh=refresh_token)


async def ensure_fresh(
    db: AsyncSession, http: httpx.AsyncClient, *, margin: int = 60
) -> tuple[str, str | None]:
    cred = await get_credential(db, "openai")
    if cred is None:
        raise RuntimeError("No OpenAI credential. Run: python -m app.cli auth-openai")
    if cred.expires_at is None or cred.expires_at <= datetime.now(UTC) + timedelta(seconds=margin):
        ts = await refresh(http, cred.refresh_token)
        cred = await upsert_credential(
            db,
            "openai",
            access_token=ts.access_token,
            refresh_token=ts.refresh_token,
            id_token=ts.id_token,
            account_id=ts.account_id,
            plan_type=ts.plan_type,
            expires_at=ts.expires_at,
        )
    return cred.access_token, cred.account_id


def _responses_headers(access_token: str, account_id: str | None) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "chatgpt-account-id": account_id or "",
        "OpenAI-Beta": "responses=experimental",
        "originator": settings.openai_originator,
        "User-Agent": settings.openai_user_agent,
        "accept": "text/event-stream",
        "content-type": "application/json",
    }


async def responses_events(
    http: httpx.AsyncClient, access_token: str, account_id: str | None, body: dict
):
    """Yield parsed JSON events from the Responses SSE stream."""
    headers = _responses_headers(access_token, account_id)
    async with http.stream(
        "POST", settings.openai_responses_url, headers=headers, json=body
    ) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                yield json.loads(data)
            except json.JSONDecodeError:
                continue
