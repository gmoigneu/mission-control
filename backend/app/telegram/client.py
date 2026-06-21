"""Thin async client for the Telegram Bot API.

Only the handful of methods the gateway needs (send a reply, show typing, manage
the webhook) — implemented over the shared ``httpx`` style used elsewhere
(see app/agent/llm.py) rather than pulling in a full bot framework.
"""
import logging
import re
from html import escape
from urllib.parse import urlparse

import httpx
from markdown_it import MarkdownIt
from markdown_it.token import Token

from app.config import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org"
# Telegram rejects messages longer than 4096 characters; long replies are split.
MAX_MESSAGE_LEN = 4096

_http_singleton: httpx.AsyncClient | None = None
_markdown = MarkdownIt("commonmark", {"html": False})
_HTML_CHUNK_TOKEN_RE = re.compile(r"(<[^>]+>|&[A-Za-z0-9#]+;)")
_OPEN_TAG_RE = re.compile(r"<([a-z]+)(?:\s[^>]*)?>")
_CLOSE_TAG_RE = re.compile(r"</([a-z]+)>")
_CLOSE_TAG_BY_NAME = {
    "a": "</a>",
    "b": "</b>",
    "blockquote": "</blockquote>",
    "code": "</code>",
    "i": "</i>",
    "pre": "</pre>",
    "s": "</s>",
}


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


def _safe_link_href(href: str | None) -> str | None:
    if not href:
        return None
    parsed = urlparse(href)
    if parsed.scheme in {"http", "https", "mailto"}:
        return href
    return None


def _close_tags(open_tags: list[tuple[str, str, str]]) -> str:
    return "".join(close_tag for _, _, close_tag in reversed(open_tags))


def _open_tags(open_tags: list[tuple[str, str, str]]) -> str:
    return "".join(open_tag for _, open_tag, _ in open_tags)


def _stack_after_token(
    open_tags: list[tuple[str, str, str]], token: str
) -> list[tuple[str, str, str]]:
    close_match = _CLOSE_TAG_RE.fullmatch(token)
    if close_match:
        closing = close_match.group(1)
        for index in range(len(open_tags) - 1, -1, -1):
            if open_tags[index][0] == closing:
                return [*open_tags[:index], *open_tags[index + 1 :]]
        return open_tags

    open_match = _OPEN_TAG_RE.fullmatch(token)
    if open_match:
        name = open_match.group(1)
        close_tag = _CLOSE_TAG_BY_NAME.get(name)
        if close_tag:
            return [*open_tags, (name, token, close_tag)]
    return open_tags


def _split_text_for_html_chunk(text: str, capacity: int) -> tuple[str, str]:
    if len(text) <= capacity:
        return text, ""
    split = text.rfind(" ", 0, capacity + 1)
    if split <= 0:
        split = text.rfind("\n", 0, capacity + 1)
    if split <= 0:
        split = capacity
    return text[:split], text[split:]


def _chunk_telegram_html(html: str, limit: int = MAX_MESSAGE_LEN) -> list[str]:
    """Split rendered Telegram HTML without cutting tags/entities."""
    chunks: list[str] = []
    current = ""
    open_tags: list[tuple[str, str, str]] = []

    def flush() -> None:
        nonlocal current
        if current.strip():
            chunks.append(f"{current}{_close_tags(open_tags)}")
        current = _open_tags(open_tags)

    tokens = [part for part in _HTML_CHUNK_TOKEN_RE.split(html or "") if part]
    for token in tokens:
        if token.startswith("<") or token.startswith("&"):
            prospective_tags = _stack_after_token(open_tags, token)
            if (
                current
                and len(current) + len(token) + len(_close_tags(prospective_tags)) > limit
            ):
                flush()
            current += token
            open_tags = prospective_tags
            continue

        remaining = token
        while remaining:
            capacity = limit - len(current) - len(_close_tags(open_tags))
            if capacity <= 0:
                flush()
                capacity = limit - len(current) - len(_close_tags(open_tags))
            piece, remaining = _split_text_for_html_chunk(remaining, capacity)
            current += piece
            if remaining:
                flush()

    if current.strip():
        chunks.append(f"{current}{_close_tags(open_tags)}")
    return chunks or [""]


def _render_inline(tokens: list[Token]) -> str:
    rendered: list[str] = []
    skip_link_close = 0
    for token in tokens:
        if token.type == "text":
            rendered.append(escape(token.content))
        elif token.type == "code_inline":
            rendered.append(f"<code>{escape(token.content)}</code>")
        elif token.type == "softbreak":
            rendered.append("\n")
        elif token.type == "hardbreak":
            rendered.append("\n")
        elif token.type == "strong_open":
            rendered.append("<b>")
        elif token.type == "strong_close":
            rendered.append("</b>")
        elif token.type == "em_open":
            rendered.append("<i>")
        elif token.type == "em_close":
            rendered.append("</i>")
        elif token.type == "s_open":
            rendered.append("<s>")
        elif token.type == "s_close":
            rendered.append("</s>")
        elif token.type == "link_open":
            href_attr = token.attrGet("href")
            href = _safe_link_href(href_attr if isinstance(href_attr, str) else None)
            if href is None:
                skip_link_close += 1
            else:
                rendered.append(f'<a href="{escape(href, quote=True)}">')
        elif token.type == "link_close":
            if skip_link_close:
                skip_link_close -= 1
            else:
                rendered.append("</a>")
        elif token.type == "image":
            rendered.append(escape(token.content))
        elif token.content:
            rendered.append(escape(token.content))
    return "".join(rendered)


def _markdown_to_telegram_html(text: str) -> str:
    """Render a safe Markdown subset into Telegram Bot API HTML."""
    tokens = _markdown.parse(text or "")
    rendered: list[str] = []
    list_stack: list[dict[str, int | str]] = []
    item_prefix = ""
    in_heading = False

    for token in tokens:
        if token.type == "heading_open":
            in_heading = True
            rendered.append("<b>")
        elif token.type == "heading_close":
            in_heading = False
            rendered.append("</b>\n\n")
        elif token.type == "paragraph_close":
            rendered.append("\n" if item_prefix else "\n\n")
            item_prefix = ""
        elif token.type == "inline":
            if item_prefix:
                rendered.append(item_prefix)
            rendered.append(_render_inline(token.children or []))
        elif token.type == "bullet_list_open":
            list_stack.append({"type": "bullet"})
        elif token.type == "ordered_list_open":
            start = token.attrGet("start")
            list_stack.append({"type": "ordered", "index": int(start) if start else 1})
        elif token.type in {"bullet_list_close", "ordered_list_close"}:
            if list_stack:
                list_stack.pop()
            if not list_stack:
                rendered.append("\n")
        elif token.type == "list_item_open":
            indent = "  " * max(len(list_stack) - 1, 0)
            if list_stack and list_stack[-1]["type"] == "ordered":
                index = int(list_stack[-1]["index"])
                item_prefix = f"{indent}{index}. "
                list_stack[-1]["index"] = index + 1
            else:
                item_prefix = f"{indent}- "
        elif token.type == "fence":
            rendered.append(f"<pre><code>{escape(token.content.rstrip())}</code></pre>\n\n")
        elif token.type == "code_block":
            rendered.append(f"<pre><code>{escape(token.content.rstrip())}</code></pre>\n\n")
        elif token.type == "blockquote_open":
            rendered.append("<blockquote>")
        elif token.type == "blockquote_close":
            rendered.append("</blockquote>\n\n")
        elif token.type == "hr":
            rendered.append("---\n\n")
        elif token.type == "html_block" and token.content and not in_heading:
            rendered.append(escape(token.content))

    return "".join(rendered).strip()


async def send_message(chat_id: int, text: str) -> None:
    """Send ``text`` to ``chat_id``, transparently splitting long replies."""
    rendered = _markdown_to_telegram_html(text)
    for piece in _chunk_telegram_html(rendered):
        if piece.strip():
            await _call(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": piece,
                    "parse_mode": "HTML",
                },
            )


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
