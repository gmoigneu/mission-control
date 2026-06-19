"""Thin async client for the Telegram Bot API.

Only the handful of methods the gateway needs (send a reply, show typing, manage
the webhook) — implemented over the shared ``httpx`` style used elsewhere
(see app/agent/llm.py) rather than pulling in a full bot framework.
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org"
# Telegram rejects messages longer than 4096 characters; long replies are split.
MAX_MESSAGE_LEN = 4096

_http_singleton: httpx.AsyncClient | None = None


class TelegramError(RuntimeError):
    """Raised when the Telegram Bot API returns ok=false or is unreachable."""


def is_configured() -> bool:
    """The bot is active only when a token is set."""
    return bool(settings.telegram_bot_token)


def _http() -> httpx.AsyncClient:
    global _http_singleton
    if _http_singleton is None:
        _http_singleton = httpx.AsyncClient(timeout=30)
    return _http_singleton


async def _call(method: str, payload: dict) -> dict:
    token = settings.telegram_bot_token
    if not token:
        raise TelegramError("TELEGRAM_BOT_TOKEN is not configured")
    url = f"{API_BASE}/bot{token}/{method}"
    resp = await _http().post(url, json=payload)
    try:
        data = resp.json()
    except ValueError as exc:  # pragma: no cover - defensive
        raise TelegramError(f"{method}: non-JSON response (HTTP {resp.status_code})") from exc
    if not data.get("ok"):
        raise TelegramError(f"{method}: {data.get('description', 'unknown error')}")
    return data.get("result", {})


def _chunk(text: str, limit: int = MAX_MESSAGE_LEN) -> list[str]:
    """Split ``text`` into <=limit pieces, preferring newline boundaries."""
    text = text or ""
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    remaining = text
    while len(remaining) > limit:
        window = remaining[:limit]
        split = window.rfind("\n")
        if split <= 0:
            split = limit
        chunks.append(remaining[:split])
        remaining = remaining[split:].lstrip("\n")
    if remaining:
        chunks.append(remaining)
    return chunks


async def send_message(chat_id: int, text: str) -> None:
    """Send ``text`` to ``chat_id``, transparently splitting long replies."""
    for piece in _chunk(text):
        if piece.strip():
            await _call("sendMessage", {"chat_id": chat_id, "text": piece})


async def send_chat_action(chat_id: int, action: str = "typing") -> None:
    """Best-effort 'typing…' indicator; failures are swallowed (cosmetic only)."""
    try:
        await _call("sendChatAction", {"chat_id": chat_id, "action": action})
    except (TelegramError, httpx.HTTPError):
        logger.debug("sendChatAction failed for chat %s", chat_id, exc_info=True)


async def set_webhook(url: str, secret: str | None = None) -> dict:
    """Register ``url`` as the bot's webhook. ``secret`` is echoed back by Telegram
    in the X-Telegram-Bot-Api-Secret-Token header on every update."""
    payload: dict = {"url": url, "allowed_updates": ["message"]}
    if secret:
        payload["secret_token"] = secret
    return await _call("setWebhook", payload)


async def delete_webhook() -> dict:
    return await _call("deleteWebhook", {})


async def get_webhook_info() -> dict:
    return await _call("getWebhookInfo", {})
