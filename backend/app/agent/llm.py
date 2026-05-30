"""LLM abstraction — provider-pluggable async complete().

Default provider: ``mock`` (deterministic, no API key required).
Real provider: ``openai_oauth`` (requires a stored OpenAI OAuth credential and
  ``LLM_PROVIDER=openai_oauth``).
"""
from __future__ import annotations

import json as _json
import re
from dataclasses import dataclass, field

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import openai_auth
from app.config import settings


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict


@dataclass
class LLMTurn:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(text: str) -> str:
    """Simple slug: lowercase, replace non-alphanumeric with dash, strip edges."""
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _tool(name: str, input_dict: dict) -> LLMTurn:
    return LLMTurn(text=None, tool_calls=[ToolCall(id="call_1", name=name, input=input_dict)])


# ---------------------------------------------------------------------------
# Mock LLM (deterministic, rule-based)
# ---------------------------------------------------------------------------

def _mock_complete(  # noqa: ARG001
    messages: list[dict], tools: list[dict], system: str
) -> LLMTurn:
    """Pure deterministic mock — no I/O, no randomness."""
    if not messages:
        return LLMTurn(text="Hello! How can I help?")

    last = messages[-1]

    # If the last message is a tool-result, summarise and terminate.
    if last.get("role") == "tool":
        return LLMTurn(text="Done — I've applied the requested changes.", tool_calls=[])

    # Also handle list-of-content-blocks (tool result role=user).
    if last.get("role") == "user" and isinstance(last.get("content"), list):
        for block in last["content"]:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                return LLMTurn(text="Done — I've applied the requested changes.", tool_calls=[])

    # Extract text from last user message.
    content = last.get("content", "")
    if isinstance(content, list):
        texts = [
            b.get("text", "")
            for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        ]
        text = " ".join(texts)
    else:
        text = str(content)

    lower = text.lower().strip()

    # ---- who do I know at <Company> ----
    m = re.search(
        r"(?:who (?:do i know|are my contacts?) at|people at)\s+([A-Za-z0-9 &.'_-]+)", lower
    )
    if m:
        company = m.group(1).strip().rstrip("?").strip()
        return _tool("who_do_i_know_at", {"company": company})

    # ---- create task ----  (match keywords case-insensitively but PRESERVE the title's casing)
    m2 = re.search(
        r"(?:create(?: a)? task(?: to)?|task to|todo:?|remind me to)\s+(.+)",
        text,
        re.IGNORECASE,
    )
    if m2:
        title = m2.group(1).strip().rstrip(".")
        return _tool("create_task", {"title": title})

    # ---- met / add / new person ----
    m3 = re.search(r"(?:met|add|new person)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", text)
    if m3:
        name = m3.group(1).strip()
        return _tool("create_person", {"name": name, "slug": _slugify(name)})

    # ---- create context ----  (preserve the name's casing)
    m4 = re.search(r"(?:create(?: a)? context|new context)\s+(.+)", text, re.IGNORECASE)
    if m4:
        cname = m4.group(1).strip().rstrip(".")
        return _tool("create_context", {"name": cname, "slug": _slugify(cname)})

    # ---- note / observation ----
    m5 = re.search(r"(?:note that|observation:|remember)\s+(.+)", lower)
    if m5:
        body = m5.group(1).strip()
        # Without a clear subject we fall through to find_entities.
        if body:
            return _tool("find_entities", {"query": body})

    # ---- conversational short messages ----
    conversational = {"hi", "hello", "hey", "thanks", "thank you", "ok", "okay", "bye"}
    if lower in conversational or len(lower) < 10:
        return LLMTurn(text="Hi! What would you like to do?", tool_calls=[])

    # ---- default: semantic search ----
    return _tool("find_entities", {"query": text})


# ---------------------------------------------------------------------------
# OpenAI OAuth LLM (via Codex Responses endpoint)
# ---------------------------------------------------------------------------

_http_singleton: httpx.AsyncClient | None = None

# Large margin used to force a token refresh on 401 retry
_FORCE_REFRESH_MARGIN = 10**9


def _http() -> httpx.AsyncClient:
    global _http_singleton
    if _http_singleton is None:
        _http_singleton = httpx.AsyncClient(timeout=120)
    return _http_singleton


def _to_responses_input(messages: list[dict]) -> list[dict]:
    """Map our generic messages to Responses API ``input`` items.

    The agent loop (agent.py) uses two internal shapes:

    Assistant tool-call turn::

        {"role": "assistant", "content": [
            {"type": "tool_use", "id": <id>, "name": <name>, "input": <dict>}, ...
        ]}

    Tool-result turn::

        {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": <id>, "content": <str>}, ...
        ]}

    These are mapped to Responses API ``function_call`` / ``function_call_output``
    items respectively.  Plain text messages are wrapped in a role/content block.
    """
    items: list[dict] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content")

        # --- Legacy role="tool" (not used by agent.py, kept for compatibility) ---
        if role == "tool":
            items.append(
                {
                    "type": "function_call_output",
                    "call_id": m.get("tool_call_id", ""),
                    "output": content
                    if isinstance(content, str)
                    else _json.dumps(content),
                }
            )
            continue

        # --- List-of-content-blocks (assistant tool-calls or user tool-results) ---
        if isinstance(content, list):
            # Check what kind of blocks are in the list
            first = content[0] if content else {}
            block_type = first.get("type") if isinstance(first, dict) else None

            if block_type == "tool_use":
                # assistant turn with tool calls → emit one function_call item per call
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    items.append(
                        {
                            "type": "function_call",
                            "call_id": block.get("id", ""),
                            "name": block.get("name", ""),
                            "arguments": _json.dumps(block.get("input") or {}),
                        }
                    )
                continue

            if block_type == "tool_result":
                # user turn with tool results → emit one function_call_output per result
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    output = block.get("content", "")
                    if not isinstance(output, str):
                        output = _json.dumps(output)
                    items.append(
                        {
                            "type": "function_call_output",
                            "call_id": block.get("tool_use_id", ""),
                            "output": output,
                        }
                    )
                continue

            # Other list content — stringify it
            text = _json.dumps(content)
            items.append({"role": role, "content": [{"type": "input_text", "text": text}]})
            continue

        # --- Plain text message ---
        text = content if isinstance(content, str) else _json.dumps(content)
        items.append({"role": role, "content": [{"type": "input_text", "text": text}]})

    return items


def _to_responses_tools(tools: list[dict]) -> list[dict]:
    return [
        {
            "type": "function",
            "name": t["name"],
            "description": t.get("description", ""),
            "parameters": t.get("input_schema", {"type": "object", "properties": {}}),
        }
        for t in tools
    ]


def _assemble_turn(events: list[dict]) -> LLMTurn:
    """Assemble a Responses SSE event list into an LLMTurn.

    Text is collected from output_text deltas; tool calls from completed function_call items.

    Tracking note: ``output_item.added/done`` carries an item with both an ``id`` (the
    item's stable id used in subsequent delta events as ``item_id``) and a ``call_id``
    (the function-call id used in the Responses API round-trip).  Delta events reference
    the item by ``item_id`` == ``id``, so we track args by ``id`` and look up ``call_id``
    from the stored item when building the final ToolCall.
    """
    text_parts: list[str] = []
    tool_calls: list[ToolCall] = []
    # keyed by item id (== item["id"])
    fn_args: dict[str, str] = {}
    fn_meta: dict[str, dict] = {}
    for ev in events:
        etype = ev.get("type", "")
        if etype.endswith("output_text.delta"):
            text_parts.append(ev.get("delta", ""))
        elif etype.endswith("output_item.added") or etype.endswith("output_item.done"):
            item = ev.get("item", {})
            if item.get("type") == "function_call":
                # Index by the item's own id (used in delta events as item_id)
                item_id = item.get("id", "")
                fn_meta[item_id] = item
                if item.get("arguments"):
                    fn_args[item_id] = item["arguments"]
        elif etype.endswith("function_call_arguments.delta"):
            item_id = ev.get("item_id", "")
            fn_args[item_id] = fn_args.get(item_id, "") + ev.get("delta", "")
        elif etype.endswith("function_call_arguments.done"):
            item_id = ev.get("item_id", "")
            if "arguments" in ev:
                fn_args[item_id] = ev["arguments"]
    for item_id, item in fn_meta.items():
        try:
            args = _json.loads(fn_args.get(item_id, "") or "{}")
        except _json.JSONDecodeError:
            args = {}
        # Use call_id for the ToolCall id (what the Responses API returns as the call
        # identifier), falling back to the item id if call_id is absent.
        call_id = item.get("call_id") or item_id
        tool_calls.append(ToolCall(id=call_id, name=item.get("name", ""), input=args))
    text = "".join(text_parts).strip()
    return LLMTurn(text=text or None, tool_calls=tool_calls)


async def _openai_oauth_complete(
    db: AsyncSession, messages: list[dict], tools: list[dict], system: str
) -> LLMTurn:
    http = _http()
    access_token, account_id = await openai_auth.ensure_fresh(db, http)
    body = {
        "model": settings.llm_model,
        "instructions": system,
        "input": _to_responses_input(messages),
        "tools": _to_responses_tools(tools),
        "stream": True,
        # The Codex/ChatGPT-subscription Responses endpoint rejects any request
        # that doesn't explicitly opt out of server-side response storage
        # (400 "Store must be set to false").
        "store": False,
    }
    try:
        events = [
            ev async for ev in openai_auth.responses_events(http, access_token, account_id, body)
        ]
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:  # refresh once + retry
            access_token, account_id = await openai_auth.ensure_fresh(
                db, http, margin=_FORCE_REFRESH_MARGIN
            )
            events = [
                ev
                async for ev in openai_auth.responses_events(http, access_token, account_id, body)
            ]
        else:
            raise
    return _assemble_turn(events)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def complete(
    messages: list[dict], tools: list[dict], system: str = "", db: AsyncSession | None = None
) -> LLMTurn:
    """Dispatch to the configured LLM provider."""
    if settings.llm_provider == "openai_oauth":
        if db is None:
            raise RuntimeError("openai_oauth provider requires a db session")
        return await _openai_oauth_complete(db, messages, tools, system)
    # Default: mock (also covers provider="mock" explicitly)
    return _mock_complete(messages, tools, system)
