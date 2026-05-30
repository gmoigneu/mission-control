"""Tool registry for the Aya agent.

Each tool has:
  - name: str
  - description: str
  - input_schema: JSON Schema dict
  - handler: async (db, args) -> dict
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.context import surface_var
from app.graph.client import neo4j_runner
from app.graph.query import who_at_company
from app.schemas.company import CompanyCreate
from app.schemas.context import ContextCreate
from app.schemas.inbox_item import InboxItemCreate
from app.schemas.observation import ObservationCreate
from app.schemas.person import PersonCreate
from app.schemas.task import TaskCreate
from app.search.query import semantic_search
from app.services import company as company_svc
from app.services import context as context_svc
from app.services import inbox_item as inbox_item_svc
from app.services import observation as observation_svc
from app.services import person as person_svc
from app.services import task as task_svc

Handler = Callable[[AsyncSession, dict[str, Any]], Awaitable[dict[str, Any]]]


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def _create_context(db: AsyncSession, args: dict) -> dict:
    obj = await context_svc.create_context(db, ContextCreate(**args), surface=surface_var.get())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _create_person(db: AsyncSession, args: dict) -> dict:
    obj = await person_svc.create_person(db, PersonCreate(**args), surface=surface_var.get())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _create_company(db: AsyncSession, args: dict) -> dict:
    obj = await company_svc.create_company(db, CompanyCreate(**args), surface=surface_var.get())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _create_task(db: AsyncSession, args: dict) -> dict:
    obj = await task_svc.create_task(db, TaskCreate(**args), surface=surface_var.get())
    await db.flush()
    return {"id": str(obj.id), "title": obj.title}


async def _add_observation(db: AsyncSession, args: dict) -> dict:
    obj = await observation_svc.create_observation(
        db, ObservationCreate(**args), surface=surface_var.get()
    )
    await db.flush()
    return {"id": str(obj.id)}


async def _capture_to_inbox(db: AsyncSession, args: dict) -> dict:
    obj = await inbox_item_svc.create_inbox_item(
        db, InboxItemCreate(**args), surface=surface_var.get()
    )
    await db.flush()
    return {"id": str(obj.id)}


async def _find_entities(db: AsyncSession, args: dict) -> dict:
    hits = await semantic_search(db, args["query"], limit=5)
    return {"hits": hits}


async def _who_do_i_know_at(db: AsyncSession, args: dict) -> dict:  # noqa: ARG001
    rows = await who_at_company(neo4j_runner, args["company"])
    return {"people": rows}


# ---------------------------------------------------------------------------
# Tool specs
# ---------------------------------------------------------------------------

TOOLS: list[dict] = [
    {
        "name": "create_context",
        "description": "Create a new context (workspace, area of life, or project container).",
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string", "description": "URL-safe unique identifier"},
                "name": {"type": "string", "description": "Human-readable name"},
                "category": {
                    "type": "string",
                    "enum": ["work", "personal", "side", "other"],
                    "description": "Context category",
                },
                "description": {"type": "string"},
            },
            "required": ["slug", "name"],
        },
        "handler": _create_context,
    },
    {
        "name": "create_person",
        "description": "Add a new person to the network.",
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string"},
                "name": {"type": "string"},
                "role": {"type": "string"},
                "email": {"type": "string"},
            },
            "required": ["slug", "name"],
        },
        "handler": _create_person,
    },
    {
        "name": "create_company",
        "description": "Add a new company to the network.",
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string"},
                "name": {"type": "string"},
                "domain": {"type": "string"},
            },
            "required": ["slug", "name"],
        },
        "handler": _create_company,
    },
    {
        "name": "create_task",
        "description": "Create a new task or to-do item.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Task title"},
                "priority": {"type": "string", "enum": ["low", "normal", "high"]},
                "body": {"type": "string"},
            },
            "required": ["title"],
        },
        "handler": _create_task,
    },
    {
        "name": "add_observation",
        "description": (
            "Record an observation, note, or fact about a person, company, or other entity."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "subject_type": {"type": "string", "description": "e.g. person, company, project"},
                "subject_id": {"type": "string", "format": "uuid"},
                "body": {"type": "string", "description": "The observation text"},
                "kind": {
                    "type": "string",
                    "enum": [
                        "observation", "preference", "fact",
                        "open_loop", "decision", "key_point", "open_question",
                    ],
                },
            },
            "required": ["subject_type", "subject_id", "body"],
        },
        "handler": _add_observation,
    },
    {
        "name": "capture_to_inbox",
        "description": (
            "Drop a raw note into the inbox for later triage. Use this as a fallback when"
            " the note can't be confidently routed to a specific entity."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "body": {"type": "string", "description": "The raw captured note"},
                "source": {"type": "string", "description": "Where the note came from"},
            },
            "required": ["body"],
        },
        "handler": _capture_to_inbox,
    },
    {
        "name": "find_entities",
        "description": (
            "Semantic search across all entities"
            " (people, tasks, companies, contexts, observations)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query"},
            },
            "required": ["query"],
        },
        "handler": _find_entities,
    },
    {
        "name": "who_do_i_know_at",
        "description": "Return all people in the network who work at the given company.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company": {"type": "string", "description": "Company slug or name"},
            },
            "required": ["company"],
        },
        "handler": _who_do_i_know_at,
    },
]

TOOL_HANDLERS: dict[str, Handler] = {t["name"]: t["handler"] for t in TOOLS}


def tool_specs_for_llm() -> list[dict]:
    """Return the name/description/input_schema list suitable for passing to the LLM."""
    return [
        {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
        for t in TOOLS
    ]
