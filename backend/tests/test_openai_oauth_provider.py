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
