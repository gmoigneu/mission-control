"""
Aya vault → Postgres one-time importer (P6).

Run:
    uv run python -m scripts.import_aya [--vault /path/to/vault]

Import order respects FK constraints:
    contexts → companies → people → projects → tasks → observations → relationships

Notes:
- Bulk inserts bypass per-row audit/outbox events intentionally (bulk speed).
  Audit coverage can be added later; the data is in Postgres.
- Neo4j graph rebuild is NOT done here. Trigger it manually via:
      POST /admin/rebuild-graph
- Vault sections with no matching table (journal, meetings, knowledge, inbox,
  tone) are silently skipped with a note in the summary.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import frontmatter
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models.company import Company
from app.models.context import Context
from app.models.observation import Observation
from app.models.person import Person
from app.models.project import Project
from app.models.relationship import Relationship
from app.models.task import Task
from app.models.telos import Telos
from app.search.index import index_subject

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    return _SLUG_RE.sub("-", text.lower()).strip("-") or "unknown"


def _parse_date(val: Any) -> date | None:
    if not val:
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _first_prose_paragraph(body: str) -> str | None:
    """Return the first non-empty, non-heading paragraph from markdown body."""
    for line in body.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and not stripped.startswith("---"):
            return stripped
    return None


def _extract_section(body: str, heading: str) -> str:
    """Extract lines under a ## heading until the next ## heading."""
    lines = body.splitlines()
    collecting = False
    result: list[str] = []
    for line in lines:
        if re.match(rf"^##\s+{re.escape(heading)}\s*$", line, re.IGNORECASE):
            collecting = True
            continue
        if collecting:
            if re.match(r"^##\s+", line):
                break
            result.append(line)
    return "\n".join(result).strip()


def _parse_obs_line(line: str) -> tuple[date | None, str, str | None]:
    """
    Parse an observation bullet line. Formats seen in the wild:
      - YYYY-MM-DD: text (#tag, source: ...)
      - [observation] text
      - text
    Returns (date, body, source).
    """
    line = line.lstrip("- ").strip()
    # Strip [observation] / [preference] prefixes
    line = re.sub(r"^\[.*?\]\s*", "", line)

    obs_date: date | None = None
    source: str | None = None

    # Try to pull a leading date
    m = re.match(r"^(\d{4}-\d{2}-\d{2}):\s*(.+)$", line, re.DOTALL)
    if m:
        obs_date = _parse_date(m.group(1))
        line = m.group(2)

    # Pull a trailing (source: ...) annotation
    sm = re.search(r"\(([^)]*source:\s*[^)]+)\)\s*$", line)
    if sm:
        source = sm.group(1)
        line = line[: sm.start()].strip()
    # Strip trailing tag annotations like (#tag1, #tag2)
    line = re.sub(r"\s*\(#[^)]*\)\s*$", "", line).strip()

    return obs_date, line, source


# ---------------------------------------------------------------------------
# Stats tracker
# ---------------------------------------------------------------------------


@dataclass
class Stats:
    contexts: int = 0
    companies: int = 0
    people: int = 0
    projects: int = 0
    tasks: int = 0
    observations: int = 0
    relationships: int = 0
    telos: int = 0
    errors: list[tuple[str, str]] = field(default_factory=list)
    unresolved_links: list[str] = field(default_factory=list)
    skipped_sections: list[str] = field(default_factory=list)

    def report(self) -> None:
        print("\n=== Aya vault import complete ===")
        print(f"  contexts      : {self.contexts}")
        print(f"  companies     : {self.companies}")
        print(f"  people        : {self.people}")
        print(f"  projects      : {self.projects}")
        print(f"  tasks         : {self.tasks}")
        print(f"  observations  : {self.observations}")
        print(f"  relationships : {self.relationships}")
        print(f"  telos         : {self.telos}")
        if self.unresolved_links:
            print(f"\n  unresolved links ({len(self.unresolved_links)}):")
            for u in self.unresolved_links[:20]:
                print(f"    {u}")
            if len(self.unresolved_links) > 20:
                print(f"    … and {len(self.unresolved_links) - 20} more")
        if self.skipped_sections:
            print("\n  skipped vault sections (no DB table yet):")
            for s in sorted(set(self.skipped_sections)):
                print(f"    {s}")
        if self.errors:
            print(f"\n  errors ({len(self.errors)}):")
            for path, err in self.errors[:30]:
                print(f"    {path}: {err}")
            if len(self.errors) > 30:
                print(f"    … and {len(self.errors) - 30} more")
        print()


# ---------------------------------------------------------------------------
# DB helpers (raw upsert to avoid per-row audit overhead)
# ---------------------------------------------------------------------------


async def _upsert_context(db: AsyncSession, slug: str, data: dict) -> Context:
    result = await db.execute(select(Context).where(Context.slug == slug))
    obj = result.scalar_one_or_none()
    if obj is None:
        obj = Context(id=uuid.uuid4(), slug=slug, **data)
        db.add(obj)
    else:
        for k, v in data.items():
            setattr(obj, k, v)
    return obj


async def _upsert_company(db: AsyncSession, slug: str, name: str) -> Company:
    result = await db.execute(select(Company).where(Company.slug == slug))
    obj = result.scalar_one_or_none()
    if obj is None:
        obj = Company(id=uuid.uuid4(), slug=slug, name=name)
        db.add(obj)
    return obj


async def _upsert_person(db: AsyncSession, slug: str, data: dict) -> Person:
    result = await db.execute(select(Person).where(Person.slug == slug))
    obj = result.scalar_one_or_none()
    if obj is None:
        obj = Person(id=uuid.uuid4(), slug=slug, **data)
        db.add(obj)
    else:
        for k, v in data.items():
            setattr(obj, k, v)
    return obj


async def _upsert_project(db: AsyncSession, slug: str, data: dict) -> Project:
    result = await db.execute(select(Project).where(Project.slug == slug))
    obj = result.scalar_one_or_none()
    if obj is None:
        obj = Project(id=uuid.uuid4(), slug=slug, **data)
        db.add(obj)
    else:
        for k, v in data.items():
            setattr(obj, k, v)
    return obj


async def _upsert_task(db: AsyncSession, slug: str, data: dict) -> Task:
    # Tasks keyed by slug derived from filename; no unique constraint on slug
    # in the schema, so we use a manual lookup by source field pattern.
    # Use "source" stored as slug marker (stored in Task.source with prefix "slug:")
    slug_marker = f"slug:{slug}"
    result = await db.execute(select(Task).where(Task.source == slug_marker))
    obj = result.scalar_one_or_none()
    if obj is None:
        obj = Task(id=uuid.uuid4(), source=slug_marker, **data)
        db.add(obj)
    else:
        for k, v in data.items():
            if k != "source":  # preserve our slug marker
                setattr(obj, k, v)
    return obj


# ---------------------------------------------------------------------------
# Import phases
# ---------------------------------------------------------------------------


async def import_contexts(
    db: AsyncSession, vault: Path, stats: Stats
) -> dict[str, uuid.UUID]:
    """Returns slug → context_id mapping."""
    context_ids: dict[str, uuid.UUID] = {}
    contexts_dir = vault / "03.contexts"
    if not contexts_dir.exists():
        return context_ids

    for ctx_dir in sorted(contexts_dir.iterdir()):
        if not ctx_dir.is_dir():
            continue
        index_file = ctx_dir / "INDEX.md"
        if not index_file.exists():
            continue
        try:
            post = frontmatter.load(str(index_file))
            slug = ctx_dir.name
            name = str(post.get("title") or slug)
            tags = post.get("tags") or []
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",")]

            # Infer category from tags
            category = "other"
            for tag in tags:
                tag_lower = str(tag).lower()
                if tag_lower in ("work", "professional"):
                    category = "work"
                    break
                if tag_lower in ("personal",):
                    category = "personal"
                    break
                if tag_lower in ("side", "side-project", "side-projects"):
                    category = "side"
                    break

            description = _first_prose_paragraph(post.content or "")
            obj = await _upsert_context(db, slug, {
                "name": name,
                "category": category,
                "description": description,
                "status": "active",
            })
            await db.flush()
            context_ids[slug] = obj.id
            stats.contexts += 1
        except Exception as exc:
            stats.errors.append((str(index_file), str(exc)))

    await db.commit()
    return context_ids


async def import_companies(
    db: AsyncSession, vault: Path, stats: Stats
) -> dict[str, uuid.UUID]:
    """Scan all people files, collect company names, upsert Company rows."""
    company_ids: dict[str, uuid.UUID] = {}
    people_dir = vault / "02.people"
    if not people_dir.exists():
        return company_ids

    company_names: dict[str, str] = {}  # slug → display name
    for pfile in sorted(people_dir.glob("*.md")):
        try:
            post = _load_person_frontmatter(pfile)
            if post is None:
                continue
            company_name = str(post.get("company") or "").strip()
            if company_name:
                cslug = slugify(company_name)
                company_names[cslug] = company_name
        except Exception:
            pass

    for cslug, cname in sorted(company_names.items()):
        try:
            obj = await _upsert_company(db, cslug, cname)
            await db.flush()
            company_ids[cslug] = obj.id
            stats.companies += 1
        except Exception as exc:
            stats.errors.append((f"company:{cslug}", str(exc)))

    await db.commit()
    return company_ids


def _load_person_frontmatter(pfile: Path) -> frontmatter.Post | None:
    """
    Load person file frontmatter. Handles three formats seen in the vault:
    1. Standard YAML-fenced (--- ... ---)
    2. Bare key-value lines at the top before first blank line / heading
    3. Files that start with # Heading followed by bare key-value lines
       (the heading is skipped, then key-value lines are parsed)
    """
    text = pfile.read_text(encoding="utf-8", errors="replace")

    # Standard frontmatter
    if text.lstrip().startswith("---"):
        try:
            return frontmatter.loads(text)
        except Exception:
            pass

    lines = text.splitlines()

    # Skip an optional leading # Heading line (and blank lines after it)
    start = 0
    if lines and re.match(r"^#\s+\S", lines[0]):
        start = 1
        while start < len(lines) and lines[start].strip() == "":
            start += 1

    # Bare format: collect key: value lines until blank line or ## heading
    fm_lines: list[str] = []
    body_lines: list[str] = []
    in_fm = True
    for line in lines[start:]:
        if in_fm:
            if line.strip() == "" or re.match(r"^#+\s+", line):
                in_fm = False
                body_lines.append(line)
            elif re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*:", line):
                fm_lines.append(line)
            else:
                # Non-matching line ends the fm block
                in_fm = False
                body_lines.append(line)
        else:
            body_lines.append(line)

    meta: dict[str, Any] = {}
    for line in fm_lines:
        m = re.match(r"^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$", line)
        if m:
            key, val = m.group(1).strip(), m.group(2).strip()
            meta[key] = val if val else None

    if not meta:
        return None

    post = frontmatter.Post("\n".join(body_lines), **meta)
    return post


async def import_people(
    db: AsyncSession,
    vault: Path,
    stats: Stats,
    context_ids: dict[str, uuid.UUID],
    company_ids: dict[str, uuid.UUID],
) -> dict[str, uuid.UUID]:
    """Returns slug → person_id mapping."""
    person_ids: dict[str, uuid.UUID] = {}
    people_dir = vault / "02.people"
    if not people_dir.exists():
        return person_ids

    for pfile in sorted(people_dir.glob("*.md")):
        try:
            post = _load_person_frontmatter(pfile)
            if post is None:
                stats.errors.append((str(pfile), "could not parse frontmatter"))
                continue

            slug = pfile.stem
            name = str(post.get("name") or post.get("title") or slug).strip()
            role = str(post.get("role") or "").strip() or None
            email = str(post.get("email") or "").strip() or None
            linkedin = str(post.get("linkedin") or "").strip() or None
            first_met = _parse_date(post.get("first_met"))

            # company_id
            company_name = str(post.get("company") or "").strip()
            company_id: uuid.UUID | None = None
            if company_name:
                cslug = slugify(company_name)
                company_id = company_ids.get(cslug)

            # primary_context_id — field may be "context" or "contexts"
            ctx_val = post.get("context") or post.get("contexts") or ""
            if isinstance(ctx_val, list):
                ctx_val = ctx_val[0] if ctx_val else ""
            ctx_slug = str(ctx_val).strip()
            primary_context_id: uuid.UUID | None = context_ids.get(ctx_slug)

            # summary from ## Context section
            summary = _extract_section(post.content or "", "Context") or None

            obj = await _upsert_person(db, slug, {
                "name": name,
                "role": role,
                "email": email,
                "linkedin": linkedin,
                "first_met": first_met,
                "company_id": company_id,
                "primary_context_id": primary_context_id,
                "summary": summary,
            })
            await db.flush()
            person_ids[slug] = obj.id
            stats.people += 1
        except Exception as exc:
            stats.errors.append((str(pfile), str(exc)))

    await db.commit()
    return person_ids


async def import_projects(
    db: AsyncSession,
    vault: Path,
    stats: Stats,
    context_ids: dict[str, uuid.UUID],
) -> None:
    contexts_dir = vault / "03.contexts"
    if not contexts_dir.exists():
        return

    STATUS_MAP = {
        "active": "active",
        "in_progress": "active",
        "in-progress": "active",
        "on_hold": "on_hold",
        "on-hold": "on_hold",
        "complete": "complete",
        "completed": "complete",
        "done": "complete",
        "archived": "archived",
    }

    for ctx_dir in sorted(contexts_dir.iterdir()):
        if not ctx_dir.is_dir():
            continue
        ctx_slug = ctx_dir.name
        ctx_id = context_ids.get(ctx_slug)
        projects_dir = ctx_dir / "projects"
        if not projects_dir.exists():
            continue
        for pfile in sorted(projects_dir.glob("*.md")):
            try:
                post = frontmatter.load(str(pfile))
                pslug = pfile.stem
                title = str(post.get("title") or pslug)
                raw_status = str(post.get("status") or "active").lower()
                status = STATUS_MAP.get(raw_status, "active")

                await _upsert_project(db, pslug, {
                    "context_id": ctx_id,
                    "title": title,
                    "status": status,
                    "body": post.content or None,
                })
                await db.flush()
                stats.projects += 1
            except Exception as exc:
                stats.errors.append((str(pfile), str(exc)))

    await db.commit()


async def import_tasks(
    db: AsyncSession,
    vault: Path,
    stats: Stats,
    context_ids: dict[str, uuid.UUID],
) -> None:
    STATUS_MAP = {
        "open": "open",
        "in_progress": "in_progress",
        "in-progress": "in_progress",
        "done": "done",
        "completed": "done",
        "complete": "done",
        "archived": "archived",
        "cancelled": "archived",
        "canceled": "archived",
    }
    PRIORITY_MAP = {
        "low": "low",
        "normal": "normal",
        "medium": "normal",
        "high": "high",
        "urgent": "high",
    }

    tasks_dir = vault / "05.tasks"
    if not tasks_dir.exists():
        stats.skipped_sections.append("05.tasks (not found)")
        return

    # open/ files — status from frontmatter, default "open"
    open_dir = tasks_dir / "open"
    task_files: list[tuple[Path, str]] = []
    if open_dir.exists():
        for tf in sorted(open_dir.glob("*.md")):
            task_files.append((tf, "open"))

    # archive/**/*.md — status "done"
    archive_dir = tasks_dir / "archive"
    if archive_dir.exists():
        for tf in sorted(archive_dir.rglob("*.md")):
            task_files.append((tf, "done"))

    for tfile, default_status in task_files:
        try:
            post = frontmatter.load(str(tfile))
            title = str(post.get("title") or tfile.stem)
            raw_status = str(post.get("status") or default_status).lower()
            status = STATUS_MAP.get(raw_status, default_status)
            raw_priority = str(post.get("priority") or "normal").lower()
            priority = PRIORITY_MAP.get(raw_priority, "normal")
            due = _parse_date(post.get("due"))
            scheduled = _parse_date(post.get("scheduled"))

            # context_id from first of "contexts" list or "context" string
            ctx_val = post.get("contexts") or post.get("context") or []
            if isinstance(ctx_val, str):
                ctx_val = [ctx_val]
            context_id: uuid.UUID | None = None
            for cv in ctx_val:
                cid = context_ids.get(str(cv).strip())
                if cid:
                    context_id = cid
                    break

            source_raw = post.get("source")
            source_str = str(source_raw).strip() if source_raw else None

            task_slug = tfile.stem
            obj = await _upsert_task(db, task_slug, {
                "title": title,
                "status": status,
                "priority": priority,
                "due": due,
                "scheduled": scheduled,
                "context_id": context_id,
                "body": post.content or None,
                # source is set to the slug marker in _upsert_task;
                # store actual source in body prefix or just use slug marker.
                # We store the vault source in the slug marker for idempotency.
            })
            # patch display source if we have it (don't overwrite the slug marker)
            # Instead embed source text in body if available
            if source_str:
                body_prefix = f"source: {source_str}\n\n"
                current_body = obj.body or ""
                if not current_body.startswith("source:"):
                    obj.body = body_prefix + current_body

            await db.flush()
            stats.tasks += 1
        except Exception as exc:
            stats.errors.append((str(tfile), str(exc)))

    await db.commit()


async def import_observations(
    db: AsyncSession,
    vault: Path,
    stats: Stats,
    person_ids: dict[str, uuid.UUID],
) -> None:
    people_dir = vault / "02.people"
    if not people_dir.exists():
        return

    SECTION_KIND_MAP = {
        "Observations": "observation",
        "Preferences": "preference",
        "Open Loops": "open_loop",
    }

    for pfile in sorted(people_dir.glob("*.md")):
        try:
            post = _load_person_frontmatter(pfile)
            if post is None:
                continue
            slug = pfile.stem
            person_id = person_ids.get(slug)
            if person_id is None:
                continue

            body_text = post.content or ""

            # Clear existing observations/preferences/open_loops for this person
            # to stay idempotent (re-import = clear + reinsert)
            await db.execute(
                sa_delete(Observation).where(
                    Observation.subject_type == "person",
                    Observation.subject_id == person_id,
                )
            )

            for section_heading, kind in SECTION_KIND_MAP.items():
                section_text = _extract_section(body_text, section_heading)
                if not section_text:
                    continue
                for line in section_text.splitlines():
                    line = line.strip()
                    if not line or not line.startswith("-"):
                        continue
                    obs_date, obs_body, source = _parse_obs_line(line)
                    if not obs_body.strip():
                        continue
                    obs = Observation(
                        id=uuid.uuid4(),
                        subject_type="person",
                        subject_id=person_id,
                        date=obs_date,
                        kind=kind,
                        body=obs_body,
                        source=source,
                    )
                    db.add(obs)
                    stats.observations += 1

            await db.flush()
        except Exception as exc:
            stats.errors.append((str(pfile), str(exc)))

    await db.commit()


async def import_relationships(
    db: AsyncSession,
    vault: Path,
    stats: Stats,
    person_ids: dict[str, uuid.UUID],
    context_ids: dict[str, uuid.UUID],
) -> None:
    """
    Parse ## Relationships sections.

    Supported line formats (both seen in the vault):
      - YYYY-MM-DD: <type>: [Name](02.people/<slug>.md); ...
      - YYYY-MM-DD: <type>: Free text (no link — skip, log unresolved)
      - YYYY-MM-DD: Free text (no type separator — skip)
    """
    people_dir = vault / "02.people"
    if not people_dir.exists():
        return

    # Regex to find wiki-style links like (02.people/<slug>.md)
    LINK_RE = re.compile(r"\((?:02\.people/)?([^/)]+)\.md\)")

    for pfile in sorted(people_dir.glob("*.md")):
        try:
            post = _load_person_frontmatter(pfile)
            if post is None:
                continue
            from_slug = pfile.stem
            from_id = person_ids.get(from_slug)
            if from_id is None:
                continue

            body_text = post.content or ""
            section = _extract_section(body_text, "Relationships")
            if not section:
                continue

            # Clear existing relationships from this person (idempotent)
            await db.execute(
                sa_delete(Relationship).where(
                    Relationship.from_person_id == from_id,
                )
            )

            for line in section.splitlines():
                line = line.strip()
                if not line or not line.startswith("-"):
                    continue
                raw = line.lstrip("- ").strip()

                # Strip optional leading date
                m = re.match(r"^\d{4}-\d{2}-\d{2}:\s*(.+)$", raw)
                if m:
                    raw = m.group(1).strip()

                # Try to split type: rest
                colon_idx = raw.find(":")
                if colon_idx == -1:
                    # No type found — skip
                    continue
                rel_type = raw[:colon_idx].strip().lower().replace(" ", "_")
                rest = raw[colon_idx + 1:].strip()

                # Find linked slugs
                link_matches = LINK_RE.findall(rest)
                if not link_matches:
                    # No resolvable link — note as unresolved
                    stats.unresolved_links.append(
                        f"{from_slug} → {rel_type}: {rest[:80]}"
                    )
                    continue

                for to_slug in link_matches:
                    to_id = person_ids.get(to_slug)
                    if to_id is None:
                        stats.unresolved_links.append(
                            f"{from_slug} → {rel_type} → {to_slug} (not found)"
                        )
                        continue
                    # Upsert by unique constraint (from, to, type)
                    result = await db.execute(
                        select(Relationship).where(
                            Relationship.from_person_id == from_id,
                            Relationship.to_person_id == to_id,
                            Relationship.type == rel_type,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing is None:
                        rel = Relationship(
                            id=uuid.uuid4(),
                            from_person_id=from_id,
                            to_person_id=to_id,
                            type=rel_type,
                        )
                        db.add(rel)
                    stats.relationships += 1

            await db.flush()
        except Exception as exc:
            stats.errors.append((str(pfile), str(exc)))

    await db.commit()


# ---------------------------------------------------------------------------
# TELOS
# ---------------------------------------------------------------------------


# (## heading, telos.kind) — sections imported as one row per bullet, except
# Mission which is imported as a single row from its prose.
_TELOS_BULLET_SECTIONS: list[tuple[str, str]] = [
    ("Problems", "problem"),
    ("Goals", "goal"),
    ("Metrics", "metric"),
    ("Wisdom", "value"),
]

# Strip a leading bold code like "**P1**" / "**G18**" / "M1" from a bullet.
_TELOS_CODE_RE = re.compile(r"^\*{0,2}([A-Z]\d+)\*{0,2}\s*")
# Strip inline tag markers like `[work]` `[gaal]` used in the vault.
_TELOS_TAG_RE = re.compile(r"`\[[^\]]+\]`\s*")


def _parse_telos_bullet(line: str) -> tuple[str, str] | None:
    """Return (title, body) for a TELOS bullet, or None if not a bullet."""
    raw = line.strip()
    if not raw.startswith("-"):
        return None
    raw = raw.lstrip("- ").strip()
    raw = _TELOS_TAG_RE.sub("", raw)
    code = ""
    m = _TELOS_CODE_RE.match(raw)
    if m:
        code = m.group(1)
        raw = raw[m.end():].strip()
    raw = raw.strip("*").strip()
    if not raw:
        return None
    # Title = code + first sentence/segment; body = full text for fidelity.
    first = re.split(r"(?<=[.!?])\s+", raw, maxsplit=1)[0].strip()
    title = f"{code} {first}".strip() if code else first
    return title[:200], raw


async def import_telos(db: AsyncSession, vault: Path, stats: Stats) -> None:
    """Import the TELOS doc (mission / goals / problems / metrics / values)."""
    telos_file = vault / "99.system" / "configuration" / "TELOS.md"
    if not telos_file.exists():
        stats.skipped_sections.append("99.system/configuration/TELOS.md (not found)")
        return

    try:
        post = frontmatter.load(str(telos_file))
    except Exception as exc:
        stats.errors.append((str(telos_file), str(exc)))
        return

    body_text = post.content or ""

    # Re-import is idempotent: clear all telos rows, then reinsert.
    await db.execute(sa_delete(Telos))

    # Mission — a single row from prose.
    mission = _extract_section(body_text, "Mission")
    if mission:
        first = re.split(r"(?<=[.!?])\s+", mission, maxsplit=1)[0].strip()
        db.add(Telos(id=uuid.uuid4(), kind="mission", title=first[:200], body=mission))
        stats.telos += 1

    # Bullet-list sections — one row per bullet.
    for heading, kind in _TELOS_BULLET_SECTIONS:
        section = _extract_section(body_text, heading)
        if not section:
            continue
        for line in section.splitlines():
            parsed = _parse_telos_bullet(line)
            if parsed is None:
                continue
            title, item_body = parsed
            db.add(Telos(id=uuid.uuid4(), kind=kind, title=title, body=item_body))
            stats.telos += 1

    await db.flush()
    await db.commit()


# ---------------------------------------------------------------------------
# Reindex
# ---------------------------------------------------------------------------


async def reindex_all(
    db: AsyncSession,
    stats: Stats,
    context_ids: dict[str, uuid.UUID],
    company_ids: dict[str, uuid.UUID],
    person_ids: dict[str, uuid.UUID],
) -> None:
    """Re-embed all imported entities so search works."""
    print("Reindexing entities for search…")

    # Contexts
    for obj in (await db.execute(select(Context))).scalars():
        try:
            await index_subject(db, "context", obj)
        except Exception:
            pass

    # Companies
    for obj in (await db.execute(select(Company))).scalars():
        try:
            await index_subject(db, "company", obj)
        except Exception:
            pass

    # People
    for obj in (await db.execute(select(Person))).scalars():
        try:
            await index_subject(db, "person", obj)
        except Exception:
            pass

    # Projects
    for obj in (await db.execute(select(Project))).scalars():
        try:
            await index_subject(db, "project", obj)
        except Exception:
            pass

    # Tasks
    for obj in (await db.execute(select(Task))).scalars():
        try:
            await index_subject(db, "task", obj)
        except Exception:
            pass

    # Observations
    for obj in (await db.execute(select(Observation))).scalars():
        try:
            await index_subject(db, "observation", obj)
        except Exception:
            pass

    # Telos
    for obj in (await db.execute(select(Telos))).scalars():
        try:
            await index_subject(db, "telos", obj)
        except Exception:
            pass

    await db.commit()
    print("Reindex complete.")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def import_vault(db: AsyncSession, vault_path: Path, *, reindex: bool = True) -> Stats:
    """
    Run the full import pipeline against the vault at vault_path.
    Returns the Stats object (useful for tests).
    """
    stats = Stats()

    # Sections we know have no DB table yet
    stats.skipped_sections.extend([
        "01.journal (no journal table)",
        "00.inbox (no inbox table)",
        "04.knowledge (no knowledge table)",
        "meetings/ sub-folders (no meeting table)",
        "99.system / tone (no table)",
    ])

    print(f"Importing from {vault_path} …")

    context_ids = await import_contexts(db, vault_path, stats)
    print(f"  contexts: {stats.contexts}")

    company_ids = await import_companies(db, vault_path, stats)
    print(f"  companies: {stats.companies}")

    person_ids = await import_people(db, vault_path, stats, context_ids, company_ids)
    print(f"  people: {stats.people}")

    await import_projects(db, vault_path, stats, context_ids)
    print(f"  projects: {stats.projects}")

    await import_tasks(db, vault_path, stats, context_ids)
    print(f"  tasks: {stats.tasks}")

    await import_observations(db, vault_path, stats, person_ids)
    print(f"  observations: {stats.observations}")

    await import_relationships(db, vault_path, stats, person_ids, context_ids)
    print(f"  relationships: {stats.relationships}")

    await import_telos(db, vault_path, stats)
    print(f"  telos: {stats.telos}")

    if reindex:
        await reindex_all(db, stats, context_ids, company_ids, person_ids)

    return stats


async def _main(vault_path: Path) -> None:
    async with SessionLocal() as db:
        stats = await import_vault(db, vault_path)
    stats.report()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import aya vault into Postgres")
    parser.add_argument(
        "--vault",
        type=Path,
        default=Path("/Users/nls/brain/aya"),
        help="Path to the aya vault directory",
    )
    args = parser.parse_args()

    if not args.vault.exists():
        print(f"ERROR: vault path does not exist: {args.vault}", file=sys.stderr)
        sys.exit(1)

    asyncio.run(_main(args.vault))


if __name__ == "__main__":
    main()
