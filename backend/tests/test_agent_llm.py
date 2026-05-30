"""Tests for the mock LLM (no API key needed)."""
from app.agent.llm import LLMTurn, _mock_complete


def _user(text: str) -> dict:
    return {"role": "user", "content": text}


def _tool_result() -> dict:
    """Simulate a tool-result message that should cause the loop to terminate."""
    return {"role": "tool", "content": "ok"}


# ---------------------------------------------------------------------------
# create_task
# ---------------------------------------------------------------------------

def test_mock_create_task_from_email_bob():
    turn = _mock_complete([_user("create a task to email Bob")], [], "")
    assert len(turn.tool_calls) == 1
    tc = turn.tool_calls[0]
    assert tc.name == "create_task"
    assert "title" in tc.input
    assert "email bob" in tc.input["title"].lower()


def test_mock_create_task_remind():
    turn = _mock_complete([_user("remind me to call Alice tomorrow")], [], "")
    assert len(turn.tool_calls) == 1
    assert turn.tool_calls[0].name == "create_task"


def test_mock_create_task_todo():
    turn = _mock_complete([_user("todo: review PR")], [], "")
    assert len(turn.tool_calls) == 1
    assert turn.tool_calls[0].name == "create_task"


# ---------------------------------------------------------------------------
# who_do_i_know_at
# ---------------------------------------------------------------------------

def test_mock_who_do_i_know_at_acme():
    turn = _mock_complete([_user("who do I know at Acme")], [], "")
    assert len(turn.tool_calls) == 1
    tc = turn.tool_calls[0]
    assert tc.name == "who_do_i_know_at"
    assert tc.input.get("company", "").lower() == "acme"


def test_mock_people_at():
    turn = _mock_complete([_user("people at OpenAI?")], [], "")
    assert len(turn.tool_calls) == 1
    assert turn.tool_calls[0].name == "who_do_i_know_at"
    assert "openai" in turn.tool_calls[0].input["company"].lower()


# ---------------------------------------------------------------------------
# terminate after tool result
# ---------------------------------------------------------------------------

def test_mock_terminates_after_tool_result():
    messages = [
        _user("who do I know at Acme"),
        _tool_result(),
    ]
    turn = _mock_complete(messages, [], "")
    assert isinstance(turn, LLMTurn)
    assert turn.tool_calls == []
    assert turn.text is not None
    assert len(turn.text) > 0


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------

def test_mock_returns_llm_turn_type():
    turn = _mock_complete([_user("hello")], [], "")
    assert isinstance(turn, LLMTurn)


def test_mock_find_entities_fallback():
    turn = _mock_complete([_user("what did we discuss about the roadmap last week?")], [], "")
    assert len(turn.tool_calls) == 1
    assert turn.tool_calls[0].name == "find_entities"
