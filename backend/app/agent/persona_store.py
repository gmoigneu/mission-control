"""SOUL — the configurable Aya persona, stored as a single Postgres row.

The persona governs *who Aya is and how it speaks* (name, role, tone, operating
principles, boundaries, freeform instructions, dock greeting). It is the
*identity / voice* layer.

The per-surface **mechanics** (how to use tools, be precise, etc.) are the
*operational* layer and are ALWAYS appended by :func:`compose_system` after the
SOUL — they can never be removed from the editor, so the agent can't be broken
from Settings.

Single-row config (single-user app), mirroring ``oauth_credential`` /
``token_store``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_persona import AgentPersona

# Upper bound on the freeform instructions to keep token cost predictable.
MAX_INSTRUCTIONS_CHARS = 8000

# ---------------------------------------------------------------------------
# Per-surface operational mechanics — ALWAYS appended after the SOUL.
# These mirror the prompts that were previously hardcoded in agent.py and are
# NOT user-editable.
# ---------------------------------------------------------------------------
_RELATIONSHIP_RULE = (
    "When a note ties two people together (spouse, partner, parent, child, sibling, "
    "colleague, manager, friend...), create BOTH people with create_person and connect "
    "them with add_relationship so the graph gets the edge. Map natural language to the "
    "relationship type (husband/wife -> partner; mom/dad/sibling/kid -> family; boss -> "
    "manager). Resolve people you might already know with find_person before creating a "
    "duplicate."
)

SURFACE_MECHANICS: dict[str, str] = {
    "chat": (
        "Read and act on their data using tools. Resolve entities with the find_* tools "
        "before updating, linking, or observing them. " + _RELATIONSHIP_RULE + " Be concise."
    ),
    "capture": (
        "Parse the user's note into entities and create them with the tools. Be precise. "
        "Route each part of the note to the right place:\n"
        "- People -> create_person (find_person first to avoid duplicates); facts about them "
        "-> add_observation on that person.\n"
        "- " + _RELATIONSHIP_RULE + "\n"
        "- A daily note, journal, or personal reflection (how the day went, feelings, what "
        "happened) -> get_or_create_journal_entry (today by default), then append_journal_log "
        "with the details; use set_journal_summary for a title.\n"
        "- To-dos / follow-ups -> create_task. Meetings -> create_meeting. Companies -> "
        "create_company. Habits done -> log_habit.\n"
        "Only when a fragment fits nowhere, drop it into the inbox with capture_to_inbox."
    ),
}
_DEFAULT_MECHANICS = SURFACE_MECHANICS["chat"]


@dataclass(frozen=True)
class DefaultPersona:
    """The built-in SOUL used when no row exists or the persona is disabled.

    Matches today's hardcoded behaviour so the assistant is unchanged out of the
    box.
    """

    name: str = "Aya"
    role: str | None = "G's assistant"
    tone: str | None = None
    greeting: str | None = "Hi G — I'm Aya. Tell me what to do, and I'll act on your data."
    instructions: str | None = None
    principles: str | None = None
    boundaries: str | None = None
    enabled: bool = True


DEFAULT_PERSONA = DefaultPersona()


class SeedPersona(TypedDict):
    name: str
    role: str
    tone: str
    greeting: str
    principles: str
    boundaries: str
    instructions: str


# A friendlier seed used by the CLI / demo seeding. Still falls within the
# default voice but fills the structured knobs so the Settings form is populated.
SEED_PERSONA: SeedPersona = {
    "name": "Aya",
    "role": "G's chief of staff",
    "tone": "concise, warm, direct",
    "greeting": "Hi G — I'm Aya. Tell me what to do, and I'll act on your data.",
    "principles": (
        "Act on the user's data, don't just talk about it. Prefer the smallest "
        "correct action. Surface what you changed so it can be undone."
    ),
    "boundaries": (
        "Don't invent facts about the user's world; read before you write. Ask "
        "only when genuinely blocked."
    ),
    "instructions": "",
}


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------
async def get_persona(db: AsyncSession) -> AgentPersona | None:
    """Return the single persona row, or ``None`` if it has never been saved."""
    result = await db.execute(select(AgentPersona).limit(1))
    return result.scalar_one_or_none()


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


async def upsert_persona(
    db: AsyncSession,
    *,
    name: str | None = None,
    role: str | None = None,
    tone: str | None = None,
    greeting: str | None = None,
    instructions: str | None = None,
    principles: str | None = None,
    boundaries: str | None = None,
    enabled: bool | None = None,
) -> AgentPersona:
    """Create or update the single persona row.

    Fields are trimmed/normalised; ``instructions`` is capped at
    :data:`MAX_INSTRUCTIONS_CHARS`. Only explicitly-provided fields are written.
    """
    persona = await get_persona(db)
    if persona is None:
        persona = AgentPersona(name=name or DEFAULT_PERSONA.name)
        db.add(persona)

    if name is not None:
        cleaned = _clean(name)
        persona.name = cleaned or DEFAULT_PERSONA.name
    if role is not None:
        persona.role = _clean(role)
    if tone is not None:
        persona.tone = _clean(tone)
    if greeting is not None:
        persona.greeting = _clean(greeting)
    if instructions is not None:
        cleaned = _clean(instructions)
        persona.instructions = cleaned[:MAX_INSTRUCTIONS_CHARS] if cleaned else None
    if principles is not None:
        persona.principles = _clean(principles)
    if boundaries is not None:
        persona.boundaries = _clean(boundaries)
    if enabled is not None:
        persona.enabled = enabled

    await db.flush()
    return persona


async def reset_persona(db: AsyncSession) -> AgentPersona:
    """Clear every editable field back to the blank default.

    Unlike :func:`upsert_persona` (which only writes provided fields and so
    cannot null a field out), this explicitly resets the row: the name returns
    to the default and every other field is cleared, with ``enabled`` back on.
    """
    persona = await get_persona(db)
    if persona is None:
        persona = AgentPersona(name=DEFAULT_PERSONA.name)
        db.add(persona)
    persona.name = DEFAULT_PERSONA.name
    persona.role = None
    persona.tone = None
    persona.greeting = None
    persona.instructions = None
    persona.principles = None
    persona.boundaries = None
    persona.enabled = True
    await db.flush()
    return persona


# ---------------------------------------------------------------------------
# Prompt composition
# ---------------------------------------------------------------------------
def _soul_preamble(persona: AgentPersona | DefaultPersona) -> str:
    """The SOUL preamble — the editable identity / voice layer."""
    lines: list[str] = []
    name = (persona.name or DEFAULT_PERSONA.name).strip()
    role = (persona.role or "").strip()

    if role:
        lines.append(f"You are {name}, {role}.")
    else:
        lines.append(f"You are {name}.")

    if persona.tone and persona.tone.strip():
        lines.append(f"Voice: {persona.tone.strip()}.")
    if persona.principles and persona.principles.strip():
        lines.append(f"Operating principles: {persona.principles.strip()}")
    if persona.boundaries and persona.boundaries.strip():
        lines.append(f"Boundaries: {persona.boundaries.strip()}")
    if persona.instructions and persona.instructions.strip():
        lines.append(persona.instructions.strip())

    return "\n".join(lines)


def compose_system(persona: AgentPersona | None, surface: str) -> str:
    """Compose the system prompt: SOUL preamble + per-surface mechanics.

    The SOUL is the editable identity layer. The surface block (tool-use
    mechanics) is always appended and is not editable. If ``persona`` is
    ``None`` or disabled, the built-in :data:`DEFAULT_PERSONA` is used so
    behaviour is unchanged out of the box.
    """
    active: AgentPersona | DefaultPersona
    if persona is None or not persona.enabled:
        active = DEFAULT_PERSONA
    else:
        active = persona

    soul = _soul_preamble(active)
    mechanics = SURFACE_MECHANICS.get(surface, _DEFAULT_MECHANICS)
    return f"{soul}\n\n{mechanics}"


def resolve_greeting(persona: AgentPersona | None) -> str:
    """The dock greeting — persona greeting when enabled, else the default."""
    if persona is not None and persona.enabled and persona.greeting and persona.greeting.strip():
        return persona.greeting.strip()
    return DEFAULT_PERSONA.greeting or ""
