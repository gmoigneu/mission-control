"""Telegram gateway: turn an inbound bot update into an agent reply.

The flow mirrors the /agent/chat endpoint but is keyed by Telegram chat id
instead of a session cookie. Access is gated by an allowlist of chat ids
(``settings.telegram_allowed_chat_id_set``) which all map to the single app user;
each chat gets its own persistent conversation thread (see TelegramChat).
"""
import logging
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.agent import run_agent
from app.agent.conversation_store import build_history_messages, create_conversation
from app.config import settings
from app.db import SessionLocal
from app.models.telegram_chat import TelegramChat
from app.models.user import AppUser
from app.services.auth import get_user_by_email
from app.services.planning_message import handle_telegram_task_command
from app.telegram import client

logger = logging.getLogger(__name__)

_HELP = (
    "I'm Aya, your Mission Control assistant. Send me anything and I'll act on "
    "your data — capture notes, create tasks, look things up.\n\n"
    "Commands:\n"
    "/new — start a fresh conversation thread\n"
    "/help — show this message"
)


def is_allowed(chat_id: int) -> bool:
    """Whether this Telegram chat is permitted to use the bot."""
    return chat_id in settings.telegram_allowed_chat_id_set


async def _resolve_app_user(db: AsyncSession) -> AppUser:
    """Resolve the single app user the bot acts as.

    Prefers ``initial_user_email`` when configured; otherwise falls back to the
    sole user. Raises if the choice is ambiguous so misconfiguration is loud.
    """
    if settings.initial_user_email:
        user = await get_user_by_email(db, settings.initial_user_email)
        if user is None:
            raise RuntimeError(
                f"INITIAL_USER_EMAIL={settings.initial_user_email!r} does not match any user"
            )
        return user
    users = list((await db.execute(select(AppUser).limit(2))).scalars().all())
    if len(users) == 1:
        return users[0]
    raise RuntimeError(
        "Cannot resolve the Telegram user: set INITIAL_USER_EMAIL to disambiguate "
        f"(found {len(users)} users)"
    )


async def _get_or_create_chat(db: AsyncSession, chat_id: int) -> TelegramChat:
    chat = await db.get(TelegramChat, chat_id)
    if chat is None:
        user = await _resolve_app_user(db)
        chat = TelegramChat(chat_id=chat_id, user_id=user.id)
        db.add(chat)
        await db.flush()
    return chat


async def _ensure_conversation(db: AsyncSession, chat: TelegramChat) -> uuid.UUID:
    if chat.conversation_id is None:
        conv = await create_conversation(db, chat.user_id)
        conv.title = "Telegram"
        chat.conversation_id = conv.id
    return chat.conversation_id


async def _start_new_thread(db: AsyncSession, chat: TelegramChat) -> None:
    conv = await create_conversation(db, chat.user_id)
    conv.title = "Telegram"
    chat.conversation_id = conv.id


async def handle_update(db: AsyncSession, update: dict) -> str | None:
    """Process one Telegram update and return the reply text to send (or None).

    Does not commit — the caller owns the transaction.
    """
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if chat_id is None:
        return None
    if not is_allowed(chat_id):
        logger.info("Ignoring Telegram update from non-allowlisted chat %s", chat_id)
        return None

    tg_chat = await _get_or_create_chat(db, chat_id)

    text = message.get("text")
    if not text:
        return "I can only handle text messages right now."
    text = text.strip()

    if text.startswith("/"):
        command = text.split()[0].split("@")[0].lower()
        if command == "/start":
            await _ensure_conversation(db, tg_chat)
            return _HELP
        if command == "/new":
            await _start_new_thread(db, tg_chat)
            return "Started a new thread. What's next?"
        if command == "/help":
            return _HELP
        return f"Unknown command {command}. Send /help for the list."

    task_reply = await handle_telegram_task_command(db, text)
    if task_reply is not None:
        return task_reply

    conversation_id = await _ensure_conversation(db, tg_chat)
    history = await build_history_messages(db, conversation_id)
    result = await run_agent(
        db, "telegram", text, conversation_id=conversation_id, history=history
    )
    return result.reply or "(no reply)"


async def process_update(update: dict) -> None:
    """Background entrypoint: open a session, handle the update, send the reply.

    Runs after the webhook has already returned 200, so the agent's latency never
    blocks the HTTP response (and Telegram never retries mid-run). Each call owns
    its own DB session and commits on success.
    """
    message = update.get("message") or {}
    chat_id = (message.get("chat") or {}).get("id")
    if chat_id is None or not is_allowed(chat_id):
        if chat_id is not None:
            logger.info("Ignoring Telegram update from non-allowlisted chat %s", chat_id)
        return

    await client.send_chat_action(chat_id, "typing")

    reply: str | None = None
    try:
        async with SessionLocal() as db:
            reply = await handle_update(db, update)
            await db.commit()
    except Exception:
        logger.exception("Failed to process Telegram update for chat %s", chat_id)
        reply = "Sorry — something went wrong handling that. Please try again."

    if reply:
        try:
            await client.send_message(chat_id, reply)
        except (client.TelegramError, httpx.HTTPError):
            logger.exception("Failed to send Telegram reply to chat %s", chat_id)
