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


@dataclass
class DeviceAuth:
    device_auth_id: str
    user_code: str
    interval: int
    verification_uri: str


@dataclass
class DeviceAuthorization:
    authorization_code: str
    code_verifier: str


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
    account_id, _ = account_id_and_expiry(access)
    expires_in = data.get("expires_in")
    expires_at = (
        datetime.now(UTC) + timedelta(seconds=int(expires_in))
        if expires_in is not None
        else None
    )
    return TokenSet(
        access_token=access,
        refresh_token=data.get("refresh_token") or fallback_refresh,
        id_token=data.get("id_token"),
        account_id=account_id,
        expires_at=expires_at,
        plan_type=data.get("chatgpt_plan_type"),
    )


async def request_device_code(http: httpx.AsyncClient) -> DeviceAuth:
    resp = await http.post(
        settings.openai_device_usercode_url,
        headers={"Content-Type": "application/json"},
        json={"client_id": settings.openai_oauth_client_id},
    )
    if resp.status_code == 404:
        raise RuntimeError(
            "OpenAI device code login is not enabled for this server. "
            "Verify the server URL or use an alternative login method."
        )
    resp.raise_for_status()
    d = resp.json()
    return DeviceAuth(
        device_auth_id=d["device_auth_id"],
        user_code=d["user_code"],
        interval=int(d["interval"]),
        verification_uri=settings.openai_device_verification_uri,
    )


async def poll_for_authorization(
    http: httpx.AsyncClient,
    device: DeviceAuth,
    *,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    now: Callable[[], float] = time.monotonic,
    timeout: int = 900,
) -> DeviceAuthorization:
    deadline = now() + timeout
    interval = device.interval
    while now() < deadline:
        resp = await http.post(
            settings.openai_device_token_url,
            headers={"Content-Type": "application/json"},
            json={"device_auth_id": device.device_auth_id, "user_code": device.user_code},
        )
        if resp.status_code == 200:
            d = resp.json()
            if not d.get("authorization_code") or not d.get("code_verifier"):
                raise RuntimeError(
                    f"Device auth token response missing fields: {json.dumps(d)}"
                )
            return DeviceAuthorization(
                authorization_code=d["authorization_code"],
                code_verifier=d["code_verifier"],
            )
        if resp.status_code in (403, 404):
            await sleep(interval)
            continue
        # Parse error body for structured error codes
        error_code: str | None = None
        if resp.content:
            try:
                body = resp.json()
                err = body.get("error")
                if isinstance(err, dict):
                    error_code = err.get("code")
                elif isinstance(err, str):
                    error_code = err
            except Exception:
                pass
        if error_code == "deviceauth_authorization_pending":
            await sleep(interval)
            continue
        elif error_code == "slow_down":
            interval += 5
            await sleep(interval)
            continue
        else:
            raise RuntimeError(
                f"Device authorization failed (HTTP {resp.status_code}): "
                f"{resp.text}"
            )
    raise RuntimeError("Device authorization timed out")


async def exchange_authorization_code(
    http: httpx.AsyncClient,
    code: str,
    code_verifier: str,
) -> TokenSet:
    resp = await http.post(
        settings.openai_token_url,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "authorization_code",
            "client_id": settings.openai_oauth_client_id,
            "code": code,
            "code_verifier": code_verifier,
            "redirect_uri": settings.openai_device_redirect_uri,
        },
    )
    resp.raise_for_status()
    return _token_set(resp.json())


async def refresh(http: httpx.AsyncClient, refresh_token: str) -> TokenSet:
    resp = await http.post(
        settings.openai_token_url,
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
        try:
            ts = await refresh(http, cred.refresh_token)
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(
                "OpenAI session expired or revoked; re-run: python -m app.cli auth-openai"
            ) from exc
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
