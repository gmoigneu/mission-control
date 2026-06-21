"""Tool registry for the Aya agent.

Each tool has:
  - name: str
  - description: str
  - input_schema: JSON Schema dict
  - handler: async (db, args) -> dict

Tools are thin wrappers over the domain services, so every AI write inherits the
same validation + audit + outbox + embeddings as the HTTP API. New entity types
should be exposed here rather than via raw SQL.
"""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from datetime import date as date_cls
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.context import surface_var
from app.graph.client import neo4j_runner
from app.graph.query import connection_path, neighbors, who_at_company
from app.schemas.company import CompanyCreate
from app.schemas.context import ContextCreate
from app.schemas.entity_link import EntityLinkCreate
from app.schemas.entity_tag import EntityTagCreate
from app.schemas.habit import HabitCreate, HabitLogCreate
from app.schemas.inbox_item import InboxItemCreate
from app.schemas.journal_entry import DailyCheckInUpdate
from app.schemas.knowledge import KnowledgeCreate
from app.schemas.meeting import MeetingCreate
from app.schemas.observation import ObservationCreate
from app.schemas.person import PersonCreate, PersonUpdate
from app.schemas.project import ProjectCreate
from app.schemas.relationship import RelationshipCreate
from app.schemas.review import ReviewCreate
from app.schemas.tag import TagCreate
from app.schemas.task import TaskCreate, TaskUpdate
from app.schemas.telos import TelosCreate, TelosUpdate
from app.search.query import semantic_search
from app.services import company as company_svc
from app.services import context as context_svc
from app.services import entity_link as entity_link_svc
from app.services import entity_tag as entity_tag_svc
from app.services import habit as habit_svc
from app.services import inbox_item as inbox_item_svc
from app.services import journal_entry as journal_svc
from app.services import knowledge as knowledge_svc
from app.services import meeting as meeting_svc
from app.services import observation as observation_svc
from app.services import person as person_svc
from app.services import project as project_svc
from app.services import relationship as relationship_svc
from app.services import review as review_svc
from app.services import tag as tag_svc
from app.services import task as task_svc
from app.services import telos as telos_svc
from app.services import tone as tone_svc

Handler = Callable[[AsyncSession, dict[str, Any]], Awaitable[dict[str, Any]]]


def _surface() -> str:
    return surface_var.get()


def _parse_date(value: str | None) -> date_cls | None:
    return date_cls.fromisoformat(value) if value else None


# ---------------------------------------------------------------------------
# Handlers — Contexts & projects
# ---------------------------------------------------------------------------

async def _create_context(db: AsyncSession, args: dict) -> dict:
    obj = await context_svc.create_context(db, ContextCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _find_context(db: AsyncSession, args: dict) -> dict:
    hits = await context_svc.search_contexts(db, args["query"])
    return {"contexts": [{"id": str(c.id), "slug": c.slug, "name": c.name} for c in hits]}


async def _create_project(db: AsyncSession, args: dict) -> dict:
    obj = await project_svc.create_project(db, ProjectCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _find_project(db: AsyncSession, args: dict) -> dict:
    hits = await project_svc.search_projects(db, args["query"])
    return {
        "projects": [
            {"id": str(p.id), "slug": p.slug, "title": p.title, "status": p.status} for p in hits
        ]
    }


# ---------------------------------------------------------------------------
# Handlers — People, companies, relationships
# ---------------------------------------------------------------------------

async def _create_person(db: AsyncSession, args: dict) -> dict:
    obj = await person_svc.create_person(db, PersonCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _find_person(db: AsyncSession, args: dict) -> dict:
    hits = await person_svc.search_people(db, args["query"])
    return {
        "people": [
            {"id": str(p.id), "slug": p.slug, "name": p.name, "role": p.role} for p in hits
        ]
    }


async def _update_person(db: AsyncSession, args: dict) -> dict:
    person_id = uuid.UUID(str(args.pop("person_id")))
    obj = await person_svc.get_person(db, person_id)
    if obj is None:
        return {"error": "person not found"}
    obj = await person_svc.update_person(db, obj, PersonUpdate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _create_company(db: AsyncSession, args: dict) -> dict:
    obj = await company_svc.create_company(db, CompanyCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _find_company(db: AsyncSession, args: dict) -> dict:
    hits = await company_svc.search_companies(db, args["query"])
    return {"companies": [{"id": str(c.id), "slug": c.slug, "name": c.name} for c in hits]}


async def _add_relationship(db: AsyncSession, args: dict) -> dict:
    obj = await relationship_svc.create_relationship(
        db, RelationshipCreate(**args), surface=_surface()
    )
    await db.flush()
    return {
        "id": str(obj.id),
        "from_person_id": str(obj.from_person_id),
        "to_person_id": str(obj.to_person_id),
        "type": obj.type,
    }


# ---------------------------------------------------------------------------
# Handlers — Observations, tags, links
# ---------------------------------------------------------------------------

async def _add_observation(db: AsyncSession, args: dict) -> dict:
    obj = await observation_svc.create_observation(
        db, ObservationCreate(**args), surface=_surface()
    )
    await db.flush()
    return {"id": str(obj.id)}


async def _add_tag(db: AsyncSession, args: dict) -> dict:
    name = args["name"].strip()
    tags = await tag_svc.list_tags(db)
    tag = next((t for t in tags if t.name.lower() == name.lower()), None)
    if tag is None:
        tag = await tag_svc.create_tag(db, TagCreate(name=name), surface=_surface())
        await db.flush()
    link = await entity_tag_svc.create_entity_tag(
        db,
        EntityTagCreate(
            tag_id=tag.id,
            subject_type=args["subject_type"],
            subject_id=uuid.UUID(str(args["subject_id"])),
        ),
        surface=_surface(),
    )
    await db.flush()
    return {"tag_id": str(tag.id), "entity_tag_id": str(link.id)}


async def _create_entity_link(db: AsyncSession, args: dict) -> dict:
    obj = await entity_link_svc.create_entity_link(
        db, EntityLinkCreate(**args), surface=_surface()
    )
    await db.flush()
    return {"id": str(obj.id)}


# ---------------------------------------------------------------------------
# Handlers — Tasks
# ---------------------------------------------------------------------------

async def _create_task(db: AsyncSession, args: dict) -> dict:
    obj = await task_svc.create_task(db, TaskCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "title": obj.title}


async def _find_tasks(db: AsyncSession, args: dict) -> dict:
    hits = await task_svc.search_tasks(db, args["query"])
    return {
        "tasks": [
            {"id": str(t.id), "title": t.title, "status": t.status, "priority": t.priority}
            for t in hits
        ]
    }


async def _update_task(db: AsyncSession, args: dict) -> dict:
    task_id = uuid.UUID(str(args.pop("task_id")))
    obj = await task_svc.get_task(db, task_id)
    if obj is None:
        return {"error": "task not found"}
    obj = await task_svc.update_task(db, obj, TaskUpdate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "title": obj.title, "status": obj.status}


async def _complete_task(db: AsyncSession, args: dict) -> dict:
    task_id = uuid.UUID(str(args["task_id"]))
    obj = await task_svc.get_task(db, task_id)
    if obj is None:
        return {"error": "task not found"}
    obj = await task_svc.update_task(
        db,
        obj,
        TaskUpdate(status="done", completed_at=datetime.now(UTC)),
        surface=_surface(),
    )
    await db.flush()
    return {"id": str(obj.id), "status": obj.status}


# ---------------------------------------------------------------------------
# Handlers — Journal
# ---------------------------------------------------------------------------

async def _get_or_create_journal_entry(db: AsyncSession, args: dict) -> dict:
    obj = await journal_svc.get_or_create_journal_entry(
        db, _parse_date(args.get("date")), surface=_surface()
    )
    await db.flush()
    return {"id": str(obj.id), "date": obj.date.isoformat()}


async def _append_journal_log(db: AsyncSession, args: dict) -> dict:
    entry_id = uuid.UUID(str(args["entry_id"]))
    obj = await journal_svc.get_journal_entry(db, entry_id)
    if obj is None:
        return {"error": "journal entry not found"}
    obj = await journal_svc.append_journal_log(db, obj, args["text"], surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "date": obj.date.isoformat()}


async def _set_journal_summary(db: AsyncSession, args: dict) -> dict:
    entry_id = uuid.UUID(str(args["entry_id"]))
    obj = await journal_svc.get_journal_entry(db, entry_id)
    if obj is None:
        return {"error": "journal entry not found"}
    obj = await journal_svc.set_journal_summary(
        db, obj, title=args.get("title"), body=args.get("body"), surface=_surface()
    )
    await db.flush()
    return {"id": str(obj.id)}


async def _set_daily_checkin(db: AsyncSession, args: dict) -> dict:
    day = _parse_date(args.get("date")) or datetime.now(UTC).date()
    payload = DailyCheckInUpdate(
        **{key: args[key] for key in ("mood", "energy", "productivity") if key in args}
    )
    obj = await journal_svc.set_daily_checkin(db, day, payload, surface=_surface())
    await db.flush()
    return {
        "id": str(obj.id),
        "date": obj.date.isoformat(),
        "mood": obj.mood,
        "energy": obj.energy,
        "productivity": obj.productivity,
    }


# ---------------------------------------------------------------------------
# Handlers — Meetings, reviews, habits, knowledge, telos
# ---------------------------------------------------------------------------

async def _create_meeting(db: AsyncSession, args: dict) -> dict:
    obj = await meeting_svc.create_meeting(db, MeetingCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _create_review(db: AsyncSession, args: dict) -> dict:
    obj = await review_svc.create_review(db, ReviewCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "title": obj.title}


async def _list_habits(db: AsyncSession, args: dict) -> dict:  # noqa: ARG001
    habits = await habit_svc.list_habits(db)
    return {
        "habits": [
            {"id": str(h.id), "slug": h.slug, "name": h.name, "cadence": h.cadence,
             "active": h.active}
            for h in habits
        ]
    }


async def _create_habit(db: AsyncSession, args: dict) -> dict:
    obj = await habit_svc.create_habit(db, HabitCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _log_habit(db: AsyncSession, args: dict) -> dict:
    habit_id = uuid.UUID(str(args["habit_id"]))
    habit = await habit_svc.get_habit(db, habit_id)
    if habit is None:
        return {"error": "habit not found"}
    day = _parse_date(args.get("date")) or datetime.now(UTC).date()
    log = await habit_svc.upsert_log(
        db, habit, HabitLogCreate(date=day, done=args.get("done", True)), surface=_surface()
    )
    await db.flush()
    return {"id": str(log.id), "date": day.isoformat(), "done": log.done}


async def _create_knowledge_note(db: AsyncSession, args: dict) -> dict:
    obj = await knowledge_svc.create_knowledge(db, KnowledgeCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "slug": obj.slug}


async def _get_telos(db: AsyncSession, args: dict) -> dict:  # noqa: ARG001
    rows = await telos_svc.list_telos(db)
    return {
        "telos": [
            {"id": str(t.id), "kind": t.kind, "title": t.title,
             "parent_id": str(t.parent_id) if t.parent_id else None}
            for t in rows
        ]
    }


async def _create_telos(db: AsyncSession, args: dict) -> dict:
    obj = await telos_svc.create_telos(db, TelosCreate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "kind": obj.kind, "title": obj.title}


async def _update_goal(db: AsyncSession, args: dict) -> dict:
    telos_id = uuid.UUID(str(args.pop("telos_id")))
    obj = await telos_svc.get_telos(db, telos_id)
    if obj is None:
        return {"error": "telos not found"}
    obj = await telos_svc.update_telos(db, obj, TelosUpdate(**args), surface=_surface())
    await db.flush()
    return {"id": str(obj.id), "kind": obj.kind, "title": obj.title}


# ---------------------------------------------------------------------------
# Handlers — Inbox & retrieval
# ---------------------------------------------------------------------------

async def _capture_to_inbox(db: AsyncSession, args: dict) -> dict:
    obj = await inbox_item_svc.create_inbox_item(
        db, InboxItemCreate(**args), surface=_surface()
    )
    await db.flush()
    return {"id": str(obj.id)}


async def _find_entities(db: AsyncSession, args: dict) -> dict:
    hits = await semantic_search(db, args["query"], types=args.get("types"), limit=5)
    return {"hits": hits}


async def _who_do_i_know_at(db: AsyncSession, args: dict) -> dict:  # noqa: ARG001
    rows = await who_at_company(neo4j_runner, args["company"])
    return {"people": rows}


async def _graph_neighbors(db: AsyncSession, args: dict) -> dict:  # noqa: ARG001
    rows = await neighbors(neo4j_runner, str(args["person_id"]))
    return {"neighbors": rows}


async def _connection_path(db: AsyncSession, args: dict) -> dict:  # noqa: ARG001
    rows = await connection_path(
        neo4j_runner, str(args["from_person_id"]), str(args["to_person_id"])
    )
    return {"path": rows}


async def _list_tones(db: AsyncSession, args: dict) -> dict:  # noqa: ARG001
    tones = await tone_svc.list_tones(db)
    return {
        "tones": [
            {
                "slug": t.slug,
                "name": t.name,
                "description": t.description,
                "sample": t.sample,
            }
            for t in tones
        ]
    }


# ---------------------------------------------------------------------------
# Tool specs
# ---------------------------------------------------------------------------

_RELATIONSHIP_TYPES = [
    "colleague", "friend", "family", "mentor", "mentee", "manager",
    "reports_to", "partner", "acquaintance", "knows",
]

TOOLS: list[dict] = [
    # ── Contexts & projects ────────────────────────────────────────────────
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
                },
                "description": {"type": "string"},
            },
            "required": ["slug", "name"],
        },
        "handler": _create_context,
    },
    {
        "name": "find_context",
        "description": "Find existing contexts by name or slug. Use before creating a duplicate.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
        "handler": _find_context,
    },
    {
        "name": "create_project",
        "description": "Create a project inside a context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "context_id": {"type": "string", "format": "uuid"},
                "slug": {"type": "string"},
                "title": {"type": "string"},
                "status": {
                    "type": "string",
                    "enum": ["active", "on_hold", "complete", "archived"],
                },
                "purpose": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["context_id", "slug", "title"],
        },
        "handler": _create_project,
    },
    {
        "name": "find_project",
        "description": "Find existing projects by title or slug.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
        "handler": _find_project,
    },
    # ── People, companies, relationships ───────────────────────────────────
    {
        "name": "create_person",
        "description": (
            "Add a new person to the network. When a note mentions someone connected to this "
            "person (spouse, child, colleague, manager...), create that person too and link "
            "them with add_relationship."
        ),
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
        "name": "find_person",
        "description": (
            "Find existing people by name or slug. Use to resolve a person to their id before "
            "linking, updating, or observing — and to avoid creating duplicates."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
        "handler": _find_person,
    },
    {
        "name": "update_person",
        "description": "Update fields on an existing person (role, company, email, summary...).",
        "input_schema": {
            "type": "object",
            "properties": {
                "person_id": {"type": "string", "format": "uuid"},
                "name": {"type": "string"},
                "role": {"type": "string"},
                "company_id": {"type": "string", "format": "uuid"},
                "email": {"type": "string"},
                "linkedin": {"type": "string"},
                "summary": {"type": "string"},
            },
            "required": ["person_id"],
        },
        "handler": _update_person,
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
        "name": "find_company",
        "description": "Find existing companies by name or slug.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
        "handler": _find_company,
    },
    {
        "name": "add_relationship",
        "description": (
            "Create a directed relationship edge between two existing people (projects to a "
            "KNOWS edge in the graph). Map natural language to the closest type: husband/wife/"
            "spouse -> partner; mom/dad/sibling/child -> family; boss -> manager."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from_person_id": {"type": "string", "format": "uuid"},
                "to_person_id": {"type": "string", "format": "uuid"},
                "type": {"type": "string", "enum": _RELATIONSHIP_TYPES},
                "since": {"type": "string", "format": "date"},
                "notes": {"type": "string"},
            },
            "required": ["from_person_id", "to_person_id", "type"],
        },
        "handler": _add_relationship,
    },
    # ── Observations, tags, links ──────────────────────────────────────────
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
        "name": "add_tag",
        "description": "Tag an entity with a label (creates the tag if it doesn't exist yet).",
        "input_schema": {
            "type": "object",
            "properties": {
                "subject_type": {"type": "string"},
                "subject_id": {"type": "string", "format": "uuid"},
                "name": {"type": "string", "description": "Tag label"},
            },
            "required": ["subject_type", "subject_id", "name"],
        },
        "handler": _add_tag,
    },
    {
        "name": "create_entity_link",
        "description": (
            "Link any two entities of any type (e.g. person->project, task->meeting) with a "
            "RELATES_TO edge. Use add_relationship for person-to-person instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from_type": {"type": "string"},
                "from_id": {"type": "string", "format": "uuid"},
                "to_type": {"type": "string"},
                "to_id": {"type": "string", "format": "uuid"},
                "kind": {"type": "string"},
            },
            "required": ["from_type", "from_id", "to_type", "to_id"],
        },
        "handler": _create_entity_link,
    },
    # ── Tasks ──────────────────────────────────────────────────────────────
    {
        "name": "create_task",
        "description": "Create a new task or to-do item.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "priority": {"type": "string", "enum": ["low", "normal", "high"]},
                "status": {
                    "type": "string",
                    "enum": ["open", "in_progress", "done", "archived"],
                },
                "due": {"type": "string", "format": "date"},
                "context_id": {"type": "string", "format": "uuid"},
                "project_id": {"type": "string", "format": "uuid"},
                "body": {"type": "string"},
            },
            "required": ["title"],
        },
        "handler": _create_task,
    },
    {
        "name": "find_tasks",
        "description": "Find tasks by title substring.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
        "handler": _find_tasks,
    },
    {
        "name": "update_task",
        "description": "Update fields on an existing task.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "format": "uuid"},
                "title": {"type": "string"},
                "status": {
                    "type": "string",
                    "enum": ["open", "in_progress", "done", "archived"],
                },
                "priority": {"type": "string", "enum": ["low", "normal", "high"]},
                "due": {"type": "string", "format": "date"},
                "body": {"type": "string"},
            },
            "required": ["task_id"],
        },
        "handler": _update_task,
    },
    {
        "name": "complete_task",
        "description": "Mark a task done and stamp its completion time.",
        "input_schema": {
            "type": "object",
            "properties": {"task_id": {"type": "string", "format": "uuid"}},
            "required": ["task_id"],
        },
        "handler": _complete_task,
    },
    # ── Journal ────────────────────────────────────────────────────────────
    {
        "name": "get_or_create_journal_entry",
        "description": (
            "Get (or create) the journal entry for a date — one per day. Defaults to today. "
            "Use this to route daily notes and personal reflections to the Journal, then "
            "append_journal_log the details."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "format": "date", "description": "Defaults to today"},
            },
        },
        "handler": _get_or_create_journal_entry,
    },
    {
        "name": "append_journal_log",
        "description": "Append a timestamped log line to a journal entry.",
        "input_schema": {
            "type": "object",
            "properties": {
                "entry_id": {"type": "string", "format": "uuid"},
                "text": {"type": "string"},
            },
            "required": ["entry_id", "text"],
        },
        "handler": _append_journal_log,
    },
    {
        "name": "set_journal_summary",
        "description": "Set a journal entry's title and/or replace its body with a summary.",
        "input_schema": {
            "type": "object",
            "properties": {
                "entry_id": {"type": "string", "format": "uuid"},
                "title": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["entry_id"],
        },
        "handler": _set_journal_summary,
    },
    {
        "name": "set_daily_checkin",
        "description": (
            "Set daily mood, energy, and/or productivity scores on a 1-5 scale. "
            "Use this when the user mentions mood, energy, productivity, focus, "
            "or a daily check-in score. Defaults to today."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "format": "date"},
                "mood": {"type": "integer", "minimum": 1, "maximum": 5},
                "energy": {"type": "integer", "minimum": 1, "maximum": 5},
                "productivity": {"type": "integer", "minimum": 1, "maximum": 5},
            },
        },
        "handler": _set_daily_checkin,
    },
    # ── Meetings, reviews, habits, knowledge, telos ────────────────────────
    {
        "name": "create_meeting",
        "description": "Create a meeting record.",
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string"},
                "title": {"type": "string"},
                "at": {"type": "string", "format": "date-time"},
                "context_id": {"type": "string", "format": "uuid"},
                "project_id": {"type": "string", "format": "uuid"},
                "location": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["slug", "title", "at"],
        },
        "handler": _create_meeting,
    },
    {
        "name": "create_review",
        "description": "Create a periodic review (weekly/monthly/quarterly).",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["weekly", "monthly", "quarterly"],
                },
                "date": {"type": "string", "format": "date"},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "highlights": {"type": "string"},
            },
            "required": ["date", "title"],
        },
        "handler": _create_review,
    },
    {
        "name": "list_habits",
        "description": "List the tracked habits.",
        "input_schema": {"type": "object", "properties": {}},
        "handler": _list_habits,
    },
    {
        "name": "create_habit",
        "description": "Create a habit to track.",
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string"},
                "name": {"type": "string"},
                "cadence": {"type": "string", "enum": ["daily", "weekly"]},
            },
            "required": ["slug", "name"],
        },
        "handler": _create_habit,
    },
    {
        "name": "log_habit",
        "description": "Log a habit as done (or not) for a date. Defaults to today.",
        "input_schema": {
            "type": "object",
            "properties": {
                "habit_id": {"type": "string", "format": "uuid"},
                "date": {"type": "string", "format": "date"},
                "done": {"type": "boolean"},
            },
            "required": ["habit_id"],
        },
        "handler": _log_habit,
    },
    {
        "name": "create_knowledge_note",
        "description": "Save a knowledge note or reference (title + body).",
        "input_schema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string"},
                "title": {"type": "string"},
                "body": {"type": "string"},
            },
            "required": ["slug", "title"],
        },
        "handler": _create_knowledge_note,
    },
    {
        "name": "get_telos",
        "description": "List the TELOS entries (mission, goals, problems, metrics, values).",
        "input_schema": {"type": "object", "properties": {}},
        "handler": _get_telos,
    },
    {
        "name": "create_telos",
        "description": "Create a TELOS entry (a goal, problem, metric, mission, or value).",
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["mission", "goal", "problem", "metric", "value"],
                },
                "title": {"type": "string"},
                "body": {"type": "string"},
                "parent_id": {"type": "string", "format": "uuid"},
            },
            "required": ["kind", "title"],
        },
        "handler": _create_telos,
    },
    {
        "name": "update_goal",
        "description": "Update an existing TELOS entry (goal) by id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "telos_id": {"type": "string", "format": "uuid"},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "kind": {
                    "type": "string",
                    "enum": ["mission", "goal", "problem", "metric", "value"],
                },
            },
            "required": ["telos_id"],
        },
        "handler": _update_goal,
    },
    # ── Inbox & retrieval ──────────────────────────────────────────────────
    {
        "name": "capture_to_inbox",
        "description": (
            "Drop a raw note into the inbox for later triage. Use this ONLY as a last resort"
            " when the note can't be routed to any specific entity, journal, or task."
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
                "types": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional entity-type filter",
                },
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
    {
        "name": "graph_neighbors",
        "description": "Return the graph neighbours (KNOWS / RELATES_TO edges) of a person.",
        "input_schema": {
            "type": "object",
            "properties": {"person_id": {"type": "string", "format": "uuid"}},
            "required": ["person_id"],
        },
        "handler": _graph_neighbors,
    },
    {
        "name": "connection_path",
        "description": "Find the shortest KNOWS path between two people in the graph.",
        "input_schema": {
            "type": "object",
            "properties": {
                "from_person_id": {"type": "string", "format": "uuid"},
                "to_person_id": {"type": "string", "format": "uuid"},
            },
            "required": ["from_person_id", "to_person_id"],
        },
        "handler": _connection_path,
    },
    {
        "name": "list_tones",
        "description": (
            "List the saved writing tones (voices). Use this to find an appropriate tone"
            " before drafting text, then write in the requested voice using its sample"
            " and description as a guide."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
        "handler": _list_tones,
    },
]

TOOL_HANDLERS: dict[str, Handler] = {t["name"]: t["handler"] for t in TOOLS}


def tool_specs_for_llm() -> list[dict]:
    """Return the name/description/input_schema list suitable for passing to the LLM."""
    return [
        {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
        for t in TOOLS
    ]
