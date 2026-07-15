"""Public, stateless Streamable HTTP MCP endpoint for Mission Control."""

from __future__ import annotations

import secrets
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import Tool as MCPTool
from mcp.types import ToolAnnotations
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.datastructures import Headers, URLPath
from starlette.responses import JSONResponse
from starlette.routing import BaseRoute, Match, NoMatchFound
from starlette.types import ASGIApp, Receive, Scope, Send

from app.agent.agent import run_agent
from app.agent.context import surface_var
from app.agent.tools import invoke_tool, mcp_tool_specs
from app.config import settings
from app.db import SessionLocal

MAX_ASK_AYA_CHARS = 20_000
SessionFactory = Callable[[], AsyncSession] | async_sessionmaker[AsyncSession]

_ASK_AYA_SPEC = {
    "name": "ask_aya",
    "description": (
        "Ask Aya to reason over Mission Control and use its tools. This is stateless and "
        "does not read or write the chat UI's conversation history."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "maxLength": MAX_ASK_AYA_CHARS,
                "description": "The request for Aya.",
            }
        },
        "required": ["message"],
    },
    "annotations": {
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
        "openWorldHint": False,
    },
}


def _transport_security_settings() -> TransportSecuritySettings:
    """Keep the SDK's DNS-rebinding protection aligned with the public app URL."""

    origin = settings.webauthn_rp_origin.rstrip("/")
    host = urlsplit(origin).netloc
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[host],
        allowed_origins=[origin],
    )


def _error(code: str, message: str, *, details: Any | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = jsonable_encoder(details)
    return {"error": error}


def _integrity_error(exc: IntegrityError) -> dict[str, Any]:
    pgcode = getattr(getattr(exc, "orig", None), "sqlstate", None)
    if pgcode == "23503":
        return _error("dependency_conflict", "Referenced records prevent this operation")
    if pgcode == "23505":
        return _error("conflict", "A record with those values already exists")
    if pgcode == "23514":
        return _error("validation_error", "A value violates a database constraint")
    return _error("conflict", "The request conflicts with current database state")


class MCPBearerAuth:
    """Small ASGI guard for the deployment-level bearer token."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if origin is not None and origin != settings.webauthn_rp_origin:
            response = JSONResponse({"detail": "Origin not allowed"}, status_code=403)
            await response(scope, receive, send)
            return

        token = settings.mcp_token
        if not token:
            await JSONResponse({"detail": "Not found"}, status_code=404)(scope, receive, send)
            return

        authorization = headers.get("authorization", "")
        expected = f"Bearer {token}"
        if not secrets.compare_digest(authorization, expected):
            await JSONResponse(
                {"detail": "Not authenticated"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )(scope, receive, send)
            return

        await self.app(scope, receive, send)


class ExactASGIRoute(BaseRoute):
    """Route an ASGI app without FastAPI's automatic slash redirect."""

    def __init__(self, path: str, app: ASGIApp) -> None:
        self.path = path
        self.app = app

    def matches(self, scope: Scope) -> tuple[Match, Scope]:
        if scope["type"] == "http" and scope["path"] == self.path:
            return Match.FULL, {}
        return Match.NONE, {}

    def url_path_for(self, name: str, /, **path_params: object) -> URLPath:
        raise NoMatchFound(name, path_params)

    async def handle(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self.app(scope, receive, send)


class MissionControlMCP(FastMCP):
    """FastMCP adapter that exposes the existing shared tool registry verbatim."""

    def __init__(
        self,
        session_factory: SessionFactory = SessionLocal,
    ) -> None:
        self._session_factory = session_factory
        super().__init__(
            "Mission Control",
            instructions=(
                "Mission Control is a full-account personal operating system. Search or get a "
                "record before changing it. Mutations execute immediately and return audit IDs; "
                "use undo_change to attempt recovery. Hard deletes respect dependency constraints."
            ),
            streamable_http_path="/mcp",
            json_response=True,
            stateless_http=True,
            transport_security=_transport_security_settings(),
        )

    async def list_tools(self) -> list[MCPTool]:
        specs = [*mcp_tool_specs(), _ASK_AYA_SPEC]
        return [
            MCPTool(
                name=spec["name"],
                description=spec["description"],
                inputSchema=spec["input_schema"],
                annotations=ToolAnnotations(**spec["annotations"]),
            )
            for spec in specs
        ]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        async with self._session_factory() as db:
            token = surface_var.set("mcp")
            try:
                if name == "ask_aya":
                    message = str(arguments.get("message", ""))
                    if not message:
                        return _error("validation_error", "message is required")
                    if len(message) > MAX_ASK_AYA_CHARS:
                        return _error(
                            "validation_error",
                            f"message must be at most {MAX_ASK_AYA_CHARS:,} characters",
                        )
                    agent_result = await run_agent(db, "mcp", message)
                    await db.commit()
                    return {
                        "agent_run_id": str(agent_result.agent_run_id),
                        "reply": agent_result.reply,
                        "writes": agent_result.writes,
                    }

                result = await invoke_tool(db, name, arguments)
                if "error" in result:
                    await db.rollback()
                    return _error("not_found", str(result["error"]))
                await db.commit()
                return result
            except ValidationError as exc:
                await db.rollback()
                return _error("validation_error", "Tool input is invalid", details=exc.errors())
            except HTTPException as exc:
                await db.rollback()
                code = "not_found" if exc.status_code == 404 else "conflict"
                return _error(code, str(exc.detail))
            except IntegrityError as exc:
                await db.rollback()
                return _integrity_error(exc)
            except (TypeError, ValueError) as exc:
                await db.rollback()
                return _error("validation_error", str(exc))
            except SQLAlchemyError:
                await db.rollback()
                return _error("internal_error", "The database operation could not be completed")
            except Exception:  # noqa: BLE001
                await db.rollback()
                return _error("internal_error", "The tool could not be completed")
            finally:
                surface_var.reset(token)


def create_mcp_server(
    session_factory: SessionFactory = SessionLocal,
) -> MissionControlMCP:
    return MissionControlMCP(session_factory=session_factory)
