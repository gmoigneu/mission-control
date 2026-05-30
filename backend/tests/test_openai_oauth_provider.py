import base64
import json
from datetime import UTC, datetime, timedelta

import httpx

from app.agent import llm
from app.agent.token_store import upsert_credential


def _jwt(account_id: str) -> str:
    def seg(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")

    exp = int((datetime.now(UTC) + timedelta(hours=1)).timestamp())
    claims = {"https://api.openai.com/auth": {"chatgpt_account_id": account_id}, "exp": exp}
    return f"{seg({'alg': 'none'})}.{seg(claims)}.s"


def _sse(events: list[dict]) -> bytes:
    return ("".join(f"data: {json.dumps(e)}\n\n" for e in events) + "data: [DONE]\n\n").encode()


def _client_returning(stream_bytes: bytes) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, content=stream_bytes, headers={"content-type": "text/event-stream"}
        )

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_assemble_text_turn():
    events = [
        {"type": "response.output_text.delta", "delta": "Hello "},
        {"type": "response.output_text.delta", "delta": "world"},
        {"type": "response.completed"},
    ]
    turn = llm._assemble_turn(events)
    assert turn.text == "Hello world"
    assert turn.tool_calls == []


def test_assemble_tool_call_turn():
    events = [
        {
            "type": "response.output_item.done",
            "item": {
                "type": "function_call",
                "call_id": "c1",
                "name": "create_task",
                "arguments": json.dumps({"title": "Email Bob"}),
            },
        },
        {"type": "response.completed"},
    ]
    turn = llm._assemble_turn(events)
    assert len(turn.tool_calls) == 1
    assert turn.tool_calls[0].name == "create_task"
    assert turn.tool_calls[0].input == {"title": "Email Bob"}


def test_to_responses_input_multi_turn():
    """2-turn message list: user → assistant tool_use → tool result → Responses items."""
    messages = [
        {"role": "user", "content": "Create a task"},
        {
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "id": "call_abc",
                    "name": "create_task",
                    "input": {"title": "Buy milk"},
                }
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "call_abc",
                    "content": json.dumps({"id": "t1"}),
                }
            ],
        },
    ]
    items = llm._to_responses_input(messages)
    # user text
    assert items[0] == {
        "role": "user",
        "content": [{"type": "input_text", "text": "Create a task"}],
    }
    # function_call item
    fc = items[1]
    assert fc["type"] == "function_call"
    assert fc["call_id"] == "call_abc"
    assert fc["name"] == "create_task"
    assert json.loads(fc["arguments"]) == {"title": "Buy milk"}
    # function_call_output item
    fco = items[2]
    assert fco["type"] == "function_call_output"
    assert fco["call_id"] == "call_abc"
    assert json.loads(fco["output"]) == {"id": "t1"}


def test_assemble_turn_delta_path():
    """Streamed function_call_arguments via delta events with separate item id vs call_id."""
    events = [
        {
            "type": "response.output_item.added",
            "item": {
                "type": "function_call",
                "id": "it1",
                "call_id": "c1",
                "name": "create_task",
            },
        },
        {
            "type": "response.function_call_arguments.delta",
            "item_id": "it1",
            "delta": '{"title":',
        },
        {
            "type": "response.function_call_arguments.delta",
            "item_id": "it1",
            "delta": '"Buy milk"}',
        },
        {
            "type": "response.function_call_arguments.done",
            "item_id": "it1",
            "arguments": '{"title":"Buy milk"}',
        },
        {"type": "response.completed"},
    ]
    turn = llm._assemble_turn(events)
    assert len(turn.tool_calls) == 1
    tc = turn.tool_calls[0]
    assert tc.id == "c1"
    assert tc.name == "create_task"
    assert tc.input == {"title": "Buy milk"}


async def test_openai_oauth_complete_end_to_end(db, monkeypatch):
    monkeypatch.setattr(llm.settings, "llm_provider", "openai_oauth")
    await upsert_credential(
        db, "openai", access_token=_jwt("acc_1"), refresh_token="R",
        account_id="acc_1", expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    stream = _sse([
        {"type": "response.output_text.delta", "delta": "Done."},
        {"type": "response.completed"},
    ])
    monkeypatch.setattr(llm, "_http", lambda: _client_returning(stream))
    turn = await llm.complete([{"role": "user", "content": "hi"}], [], "sys", db=db)
    assert turn.text == "Done."
