# Connect a coding agent over MCP

Mission Control exposes a public, stateless Streamable HTTP MCP endpoint at:

```
https://mission-control.example.com/api/mcp
```

Replace the hostname with the same public origin configured as
`WEBAUTHN_RP_ORIGIN`. The deployment proxy removes `/api`, so the application
receives the endpoint as `/mcp`.

## Enable it

Set `MCP_TOKEN` on the API service to a random value of at least 32 characters,
then redeploy. It is disabled and returns `404` until configured.

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Treat this as a full-account password: its holder can read, create, update,
delete, and undo Mission Control records. Store it in your deployment secret
manager and in the coding agent's local environment, never in source control.

```bash
export MISSION_CONTROL_MCP_TOKEN='replace-with-your-token'
```

Clients authenticate with this header on every request:

```text
Authorization: Bearer $MISSION_CONTROL_MCP_TOKEN
```

## Client setup

Use the exact URL without a trailing slash.

### Codex

```bash
codex mcp add mission-control \
  --url https://mission-control.example.com/api/mcp \
  --bearer-token-env-var MISSION_CONTROL_MCP_TOKEN
```

### Claude Code

```bash
claude mcp add --transport http mission-control \
  https://mission-control.example.com/api/mcp \
  --header "Authorization: Bearer ${MISSION_CONTROL_MCP_TOKEN}"
```

### Cursor

Add this to `~/.cursor/mcp.json` for all projects, or `.cursor/mcp.json` for
one project. Ensure Cursor inherits `MISSION_CONTROL_MCP_TOKEN` when it starts.

```json
{
  "mcpServers": {
    "mission-control": {
      "url": "https://mission-control.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MISSION_CONTROL_MCP_TOKEN}"
      }
    }
  }
}
```

### VS Code and GitHub Copilot

Add this to `.vscode/mcp.json`, or use **MCP: Open User Configuration** for a
personal configuration. VS Code will prompt for the token rather than storing
it in the file.

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "mission-control-token",
      "description": "Mission Control MCP token",
      "password": true
    }
  ],
  "servers": {
    "mission-control": {
      "type": "http",
      "url": "https://mission-control.example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${input:mission-control-token}"
      }
    }
  }
}
```

For GitHub Copilot CLI instead:

```bash
copilot mcp add --transport http mission-control \
  --header "Authorization: Bearer ${MISSION_CONTROL_MCP_TOKEN}" \
  https://mission-control.example.com/api/mcp
```

## What the server exposes

The endpoint exposes the same domain tools Aya can use: typed paginated lists,
partial updates, direct CRUD for user-facing records, search and graph helpers,
and `undo_change` using the audit ID returned by each mutation. `ask_aya` is
also available for a stateless Aya request; it does not read or append the chat
UI's conversation history.

MCP only exposes tools, not prompts or resources. Originless coding-agent
requests are accepted. If an `Origin` header is present, it must exactly equal
`WEBAUTHN_RP_ORIGIN`.
