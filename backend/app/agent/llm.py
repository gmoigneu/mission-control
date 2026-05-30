"""LLM abstraction — provider-pluggable async complete().

Default provider: ``mock`` (deterministic, no API key required).
Real provider: ``anthropic`` (requires ``uv add anthropic``,
  ``ANTHROPIC_API_KEY`` env var and ``LLM_PROVIDER=anthropic``).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


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

    # Also handle list-of-content-blocks (Anthropic-style tool result role=user).
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

    # ---- create task ----
    m2 = re.search(
        r"(?:create(?: a)? task(?: to)?|task to|todo:?|remind me to)\s+(.+)", lower
    )
    if m2:
        title = m2.group(1).strip().rstrip(".")
        return _tool("create_task", {"title": title})

    # ---- met / add / new person ----
    m3 = re.search(r"(?:met|add|new person)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", text)
    if m3:
        name = m3.group(1).strip()
        return _tool("create_person", {"name": name, "slug": _slugify(name)})

    # ---- create context ----
    m4 = re.search(r"(?:create(?: a)? context|new context)\s+(.+)", lower)
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
# Anthropic LLM
# ---------------------------------------------------------------------------

async def _anthropic_complete(
    messages: list[dict], tools: list[dict], system: str
) -> LLMTurn:
    """Real Anthropic implementation — lazy import, no hard dep."""
    from anthropic import AsyncAnthropic

    from app.config import settings

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=settings.llm_model,
        max_tokens=4096,
        system=system,
        tools=tools,
        messages=messages,
    )

    tool_calls: list[ToolCall] = []
    text_parts: list[str] = []
    for block in response.content:
        if block.type == "tool_use":
            tool_calls.append(ToolCall(id=block.id, name=block.name, input=dict(block.input)))
        elif block.type == "text":
            text_parts.append(block.text)

    text = " ".join(text_parts).strip() or None
    return LLMTurn(text=text, tool_calls=tool_calls)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def complete(messages: list[dict], tools: list[dict], system: str = "") -> LLMTurn:
    """Dispatch to the configured LLM provider."""
    from app.config import settings

    if settings.llm_provider == "anthropic":
        return await _anthropic_complete(messages, tools, system)
    # Default: mock (also covers provider="mock" explicitly)
    return _mock_complete(messages, tools, system)
