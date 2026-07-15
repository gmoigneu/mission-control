"""MCP endpoint and shared-registry integration tests."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.agent.context import surface_var
from app.agent.tools import invoke_tool, mcp_tool_specs
from app.config import settings
from app.models.context import Context


class _BorrowedSession:
    """Use the test transaction without letting the mounted MCP app close it."""

    def __init__(self, db) -> None:
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *args) -> None:
        return None


def _mcp_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-11-25",
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_shared_crud_tools_return_audit_ids_and_can_be_undone(db):
    surface_token = surface_var.set("mcp")
    try:
        created = await invoke_tool(
            db,
            "create_context",
            {
                "slug": "mcp-shared-crud",
                "name": "MCP shared CRUD",
                "status": "archived",
                "color": "violet",
            },
        )
        assert created["id"]
        assert created["audit_id"]
        context_id = created["id"]

        updated = await invoke_tool(
            db,
            "update_context",
            {"context_id": context_id, "description": "Updated through the shared registry"},
        )
        assert updated["description"] == "Updated through the shared registry"
        assert updated["audit_id"]

        deleted = await invoke_tool(db, "delete_context", {"context_id": context_id})
        assert deleted["audit_id"]
        assert await db.get(Context, context_id) is None

        undone = await invoke_tool(db, "undo_change", {"audit_id": deleted["audit_id"]})
        assert undone["reverted"] is True
        restored = await db.get(Context, context_id)
        assert restored is not None
        assert restored.description == "Updated through the shared registry"
    finally:
        surface_var.reset(surface_token)


def test_mcp_specs_include_crud_and_safe_annotations():
    specs = {spec["name"]: spec for spec in mcp_tool_specs()}
    assert {
        "get_context",
        "list_contexts",
        "update_context",
        "delete_context",
        "undo_change",
    } <= set(specs)
    assert specs["get_context"]["annotations"]["readOnlyHint"] is True
    assert specs["delete_context"]["annotations"]["destructiveHint"] is True
    assert specs["list_contexts"]["input_schema"]["properties"]["limit"]["maximum"] == 100


@pytest.mark.asyncio(loop_scope="session")
async def test_mcp_requires_bearer_token(client):
    response = await client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert response.status_code == 404

    token = "m" * 32
    previous = settings.mcp_token
    settings.mcp_token = token
    try:
        response = await client.post(
            "/mcp",
            headers=_mcp_headers("wrong"),
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        )
    finally:
        settings.mcp_token = previous
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio(loop_scope="session")
async def test_mcp_initializes_and_lists_tools_with_valid_bearer(db):
    from app.main import app

    token = "m" * 32
    previous_token = settings.mcp_token
    previous_factory = app.state.mcp_server._session_factory
    settings.mcp_token = token
    app.state.mcp_server._session_factory = lambda: _BorrowedSession(db)
    try:
        async with app.router.lifespan_context(app):
            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://localhost:5173"
            ) as mcp_client:
                initialized = await mcp_client.post(
                    "/mcp",
                    headers=_mcp_headers(token),
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "initialize",
                        "params": {
                            "protocolVersion": "2025-11-25",
                            "capabilities": {},
                            "clientInfo": {"name": "pytest", "version": "1"},
                        },
                    },
                )
                assert initialized.status_code == 200, initialized.text
                assert initialized.json()["result"]["serverInfo"]["name"] == "Mission Control"

                tools = await mcp_client.post(
                    "/mcp",
                    headers=_mcp_headers(token),
                    json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
                )
                assert tools.status_code == 200, tools.text
                names = {tool["name"] for tool in tools.json()["result"]["tools"]}
                assert {"create_context", "delete_context", "undo_change", "ask_aya"} <= names
    finally:
        app.state.mcp_server._session_factory = previous_factory
        settings.mcp_token = previous_token
