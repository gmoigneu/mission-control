"""Tests for the OpenRouter LLM provider (OpenAI-compatible Chat Completions).

These exercise the pure message/tool mappers, the response parser, and the
``complete()`` dispatch against a stubbed HTTP client — no network, no DB.
"""
import json

import pytest

from app.agent import llm
from app.agent.llm import ToolCall

# --- Fake HTTP plumbing -------------------------------------------------------


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise AssertionError(f"unexpected error status {self.status_code}")

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    """Captures the outgoing request and returns a canned response."""

    def __init__(self, payload: dict):
        self._payload = payload
        self.calls: list[dict] = []

    async def post(self, url, json=None, headers=None):  # noqa: A002 - mirrors httpx
        self.calls.append({"url": url, "json": json, "headers": headers})
        return _FakeResponse(self._payload)


@pytest.fixture
def openrouter_env(monkeypatch):
    monkeypatch.setattr(llm.settings, "llm_provider", "openrouter")
    monkeypatch.setattr(llm.settings, "openrouter_api_key", "test-key")
    monkeypatch.setattr(llm.settings, "openrouter_model", "deepseek/deepseek-v4-flash")
    monkeypatch.setattr(llm.settings, "openrouter_base_url", "https://openrouter.ai/api/v1")


def _stub_http(monkeypatch, payload: dict) -> _FakeClient:
    client = _FakeClient(payload)
    monkeypatch.setattr(llm, "_http", lambda: client)
    return client


# --- Mapper unit tests --------------------------------------------------------


def test_to_chat_messages_maps_system_text_tooluse_and_result():
    messages = [
        {"role": "user", "content": "hi"},
        {
            "role": "assistant",
            "content": [{"type": "tool_use", "id": "c1", "name": "create_task",
                         "input": {"title": "Buy milk"}}],
        },
        {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": "c1", "content": "done"}],
        },
    ]

    out = llm._to_chat_messages(messages, "SYSTEM")

    assert out[0] == {"role": "system", "content": "SYSTEM"}
    assert out[1] == {"role": "user", "content": "hi"}
    assert out[2]["role"] == "assistant"
    call = out[2]["tool_calls"][0]
    assert call["id"] == "c1"
    assert call["type"] == "function"
    assert call["function"]["name"] == "create_task"
    assert json.loads(call["function"]["arguments"]) == {"title": "Buy milk"}
    assert out[3] == {"role": "tool", "tool_call_id": "c1", "content": "done"}


def test_to_chat_messages_omits_system_when_empty():
    out = llm._to_chat_messages([{"role": "user", "content": "hi"}], "")
    assert out == [{"role": "user", "content": "hi"}]


def test_to_chat_tools_shape():
    tools = [{"name": "create_task", "description": "Make a task",
              "input_schema": {"type": "object", "properties": {"title": {"type": "string"}}}}]
    out = llm._to_chat_tools(tools)
    assert out == [
        {
            "type": "function",
            "function": {
                "name": "create_task",
                "description": "Make a task",
                "parameters": {"type": "object", "properties": {"title": {"type": "string"}}},
            },
        }
    ]


# --- Parser unit tests --------------------------------------------------------


def test_parse_text_reply():
    turn = llm._parse_chat_completion(
        {"choices": [{"message": {"role": "assistant", "content": "Hello there"}}]}
    )
    assert turn.text == "Hello there"
    assert turn.tool_calls == []


def test_parse_tool_call_reply():
    turn = llm._parse_chat_completion(
        {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_abc",
                                "type": "function",
                                "function": {
                                    "name": "create_task",
                                    "arguments": '{"title": "Buy milk"}',
                                },
                            }
                        ],
                    }
                }
            ]
        }
    )
    assert turn.text is None
    assert turn.tool_calls == [
        ToolCall(id="call_abc", name="create_task", input={"title": "Buy milk"})
    ]


def test_parse_handles_empty_choices_and_bad_arguments():
    assert llm._parse_chat_completion({"choices": []}).tool_calls == []
    # Malformed JSON arguments degrade to an empty dict rather than raising.
    turn = llm._parse_chat_completion(
        {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {"id": "x", "function": {"name": "f", "arguments": "{not json"}}
                        ],
                    }
                }
            ]
        }
    )
    assert turn.tool_calls == [ToolCall(id="x", name="f", input={})]


# --- End-to-end complete() dispatch ------------------------------------------


async def test_complete_text_reply_sends_expected_request(monkeypatch, openrouter_env):
    client = _stub_http(
        monkeypatch,
        {"choices": [{"message": {"content": "Hi! What would you like to do?"}}]},
    )

    turn = await llm.complete([{"role": "user", "content": "hi"}], [], "be helpful", db=None)

    assert turn.text == "Hi! What would you like to do?"
    assert turn.tool_calls == []

    sent = client.calls[0]
    assert sent["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert sent["json"]["model"] == "deepseek/deepseek-v4-flash"
    assert sent["json"]["messages"][0] == {"role": "system", "content": "be helpful"}
    assert sent["headers"]["Authorization"] == "Bearer test-key"
    assert "tools" not in sent["json"]  # empty tools list is omitted


async def test_complete_tool_call_reply(monkeypatch, openrouter_env):
    _stub_http(
        monkeypatch,
        {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "create_task",
                                    "arguments": '{"title": "Ship it"}',
                                },
                            }
                        ],
                    }
                }
            ]
        },
    )
    tools = [{"name": "create_task", "description": "", "input_schema": {"type": "object"}}]

    turn = await llm.complete([{"role": "user", "content": "task to ship it"}], tools, "", db=None)

    assert turn.text is None
    assert turn.tool_calls == [
        ToolCall(id="call_1", name="create_task", input={"title": "Ship it"})
    ]


async def test_complete_requires_api_key(monkeypatch):
    monkeypatch.setattr(llm.settings, "llm_provider", "openrouter")
    monkeypatch.setattr(llm.settings, "openrouter_api_key", None)

    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        await llm.complete([{"role": "user", "content": "hi"}], [], "", db=None)
