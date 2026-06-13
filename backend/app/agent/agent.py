"""Agent loop — runs a multi-step tool-calling conversation and records the run."""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.context import agent_run_id_var, surface_var
from app.agent.llm import complete
from app.agent.persona_store import compose_system, get_persona
from app.agent.tools import TOOL_HANDLERS, tool_specs_for_llm
from app.models.agent_run import AgentRun
from app.models.audit import AuditLog


@dataclass
class AgentResult:
    agent_run_id: uuid.UUID
    reply: str
    writes: list[dict] = field(default_factory=list)


async def run_agent(
    db: AsyncSession,
    surface: str,
    user_input: str,
    *,
    conversation_id: uuid.UUID | None = None,
    history: list[dict] | None = None,
    max_steps: int = 12,
) -> AgentResult:
    """Run the agent loop for one user turn.

    ``history`` seeds the conversation so far (prior turns' transcripts) — the
    model sees it for context, but it is *not* re-stored on this run, so the
    thread never duplicates. ``conversation_id`` links this run to its thread.

    The *caller* must ``await db.commit()`` after this returns so that all
    writes (agent_run row + entity rows + audit rows) land in one transaction.
    """
    run = AgentRun(surface=surface, input=user_input, conversation_id=conversation_id)
    db.add(run)
    await db.flush()  # get run.id

    run_id_token = agent_run_id_var.set(run.id)
    surface_token = surface_var.set(surface)

    # SOUL (identity / voice) loaded from the DB, with the per-surface tool-use
    # mechanics always appended. Falls back to the built-in default when no
    # persona is saved or it is disabled, so behaviour is unchanged out of box.
    persona = await get_persona(db)
    system = compose_system(persona, surface)
    # Seed prior turns for context; remember where this turn starts so only the
    # new portion is persisted as this run's transcript.
    seed = list(history or [])
    seed_len = len(seed)
    messages: list[dict] = [*seed, {"role": "user", "content": user_input}]
    reply = "I wasn't able to complete that request."
    all_tool_calls: list[dict] = []

    try:
        for _ in range(max_steps):
            turn = await complete(messages, tool_specs_for_llm(), system, db=db)

            if turn.tool_calls:
                # Record the assistant message with tool calls
                assistant_content: list[dict] = []
                for tc in turn.tool_calls:
                    all_tool_calls.append({"id": tc.id, "name": tc.name, "input": tc.input})
                    assistant_content.append(
                        {
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.name,
                            "input": tc.input,
                        }
                    )
                messages.append({"role": "assistant", "content": assistant_content})

                # Execute each tool call and append results
                tool_results: list[dict] = []
                for tc in turn.tool_calls:
                    handler = TOOL_HANDLERS.get(tc.name)
                    if handler is None:
                        result_content = json.dumps({"error": f"Unknown tool: {tc.name}"})
                    else:
                        try:
                            result = await handler(db, tc.input)
                            result_content = json.dumps(result)
                        except Exception as exc:  # noqa: BLE001
                            result_content = json.dumps({"error": str(exc)})

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tc.id,
                            "content": result_content,
                        }
                    )

                messages.append({"role": "user", "content": tool_results})
                continue

            if turn.text:
                reply = turn.text
                break

        # max_steps reached without a text reply → use fallback already set above

        # Record Aya's final reply as the closing assistant message so replayed
        # history includes her answers (not just the user's turns + tool calls).
        messages.append({"role": "assistant", "content": reply})

        # Collect audit rows written during this run
        stmt = (
            select(AuditLog)
            .where(AuditLog.agent_run_id == run.id)
            .order_by(AuditLog.created_at)
        )
        audit_rows = list((await db.execute(stmt)).scalars().all())
        writes = [
            {
                "id": str(a.id),
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_id": str(a.entity_id),
            }
            for a in audit_rows
        ]

        # Persist only this turn's portion (exclude seeded history) so the thread
        # reconstructs cleanly from concatenated run transcripts.
        run.transcript = messages[seed_len:]
        run.tool_calls = all_tool_calls
        run.reply = reply
        run.status = "ok"
        await db.flush()

        return AgentResult(agent_run_id=run.id, reply=reply, writes=writes)

    except Exception as exc:
        run.status = "error"
        run.error = str(exc)
        run.transcript = messages[seed_len:]
        run.tool_calls = all_tool_calls
        await db.flush()
        raise

    finally:
        agent_run_id_var.reset(run_id_token)
        surface_var.reset(surface_token)
