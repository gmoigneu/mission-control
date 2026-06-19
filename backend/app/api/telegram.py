"""Telegram webhook — POST /telegram/webhook.

Inbound updates from Telegram. There is no session cookie here, so the route is
not behind get_current_user; instead Telegram is authenticated by the shared
secret it echoes in the X-Telegram-Bot-Api-Secret-Token header (set via
setWebhook). The actual work runs in a background task so the agent's latency
never blocks the response — Telegram retries on slow/failed webhooks, and we
want to ack fast.
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, BackgroundTasks, Header, Request, status
from fastapi.responses import JSONResponse

from app.config import settings
from app.telegram import client
from app.telegram.gateway import process_update

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> JSONResponse:
    # Feature is off unless both the bot token and a webhook secret are configured.
    if not client.is_configured() or not settings.telegram_webhook_secret:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "Not found"})

    # Constant-time check of the secret Telegram echoes back on every update.
    expected = settings.telegram_webhook_secret
    if not x_telegram_bot_api_secret_token or not secrets.compare_digest(
        x_telegram_bot_api_secret_token, expected
    ):
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN, content={"detail": "Forbidden"}
        )

    update = await request.json()
    background_tasks.add_task(process_update, update)
    # Ack immediately; the reply is sent from the background task.
    return JSONResponse(status_code=status.HTTP_200_OK, content={"ok": True})
