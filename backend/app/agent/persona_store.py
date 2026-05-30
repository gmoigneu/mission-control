"""Persona ("SOUL") storage + system-prompt composition.

The persona governs *who* Aya is and *how* she speaks. It is stored as a single
row (mirroring ``oauth_credential`` / ``token_store``) and is user-editable from
Settings. The persona NEVER controls tool-use or safety mechanics: those are the
fixed per-surface task instructions, always appended by the system after the
SOUL preamble so the editor cannot remove them.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_persona import AgentPersona

# Maximum length of the freeform ``instructions`` SOUL body. Trimmed on save.
MAX_INSTRUCTIONS = 8000

# ---------------------------------------------------------------------------
# Fixed per-surface task mechanics — NOT editable. These are always appended
# after the SOUL preamble. They preserve the exact behavior of the previously
# hardcoded ``_SYSTEM_BY_SURFACE`` in agent.py.
# ---------------------------------------------------------------------------
SURFACE_MECHANICS: dict[str, str] = {
    "chat": "Read and act on their data using tools. Be concise.",
    "capture": (
        "Parse the user's note into entities and create them with the tools. Be precise."
    ),
}
_DEFAULT_MECHANICS = SURFACE_MECHANICS["chat"]


@dataclass
class DefaultPersona:
    """Built-in persona used when none is stored or the stored one is disabled.

    Matches the original hardcoded prompt ("You are Aya, G's assistant.").
    """

    name: str = "Aya"
    role: str | None = "G's assistant"
    tone: str | None = None
    greeting: str | None = None
    instructions: str | None = None
    principles: str | None = None
    boundaries: str | None = None
    enabled: bool = True


DEFAULT_PERSONA = DefaultPersona()


async def get_persona(db: AsyncSession) -> AgentPersona | None:
    """Return the single stored persona row, or ``None`` if none exists."""
    result = await db.execute(select(AgentPersona))
    return result.scalars().first()


def _normalize_instructions(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    return trimmed[:MAX_INSTRUCTIONS]


async def upsert_persona(db: AsyncSession, **fields: object) -> AgentPersona:
    """Create or update the single persona row.

    Only keys present in ``fields`` are written. ``instructions`` is trimmed and
    capped to ``MAX_INSTRUCTIONS`` chars; empty strings normalize to ``None``.
    """
    persona = await get_persona(db)
    if persona is None:
        persona = AgentPersona()
        db.add(persona)

    if "instructions" in fields:
        fields = {**fields, "instructions": _normalize_instructions(fields["instructions"])}  # type: ignore[arg-type]

    for key, value in fields.items():
        setattr(persona, key, value)

    # ``name`` must never be blank.
    if not (persona.name or "").strip():
        persona.name = DEFAULT_PERSONA.name

    await db.flush()
    return persona


def _effective(persona: AgentPersona | DefaultPersona | None) -> AgentPersona | DefaultPersona:
    """Return the persona to use, falling back to the default when absent/disabled."""
    if persona is None or not persona.enabled:
        return DEFAULT_PERSONA
    return persona


def compose_system(persona: AgentPersona | DefaultPersona | None, surface: str) -> str:
    """Build the full system prompt: SOUL preamble + fixed per-surface mechanics.

    The SOUL preamble is derived from the (possibly user-edited) persona. The
    per-surface task mechanics are appended afterward and are not editable.
    """
    p = _effective(persona)

    lines: list[str] = []
    name = (p.name or DEFAULT_PERSONA.name).strip() or DEFAULT_PERSONA.name
    if p.role:
        lines.append(f"You are {name}, {p.role}.")
    else:
        lines.append(f"You are {name}.")
    if p.tone:
        lines.append(f"Tone: {p.tone}")
    if p.principles:
        lines.append(f"Principles: {p.principles}")
    if p.boundaries:
        lines.append(f"Boundaries: {p.boundaries}")
    if p.instructions:
        lines.append(p.instructions)

    # Compose as: SOUL preamble, then a blank-separated mechanics block.
    soul_text = "\n".join(lines).strip()

    mechanics = SURFACE_MECHANICS.get(surface, _DEFAULT_MECHANICS)
    return f"{soul_text}\n\n{mechanics}".strip()
