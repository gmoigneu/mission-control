"""Deterministic demo fixtures — a fictional persona for screenshots and demos.

Everything in this module is invented. It contains no real personal data, so a
seeded instance is safe to screenshot, record, or share publicly. ``seed_demo``
optionally wipes the domain tables first, giving a clean, shareable local
instance with one command. The ``oauth_credential`` row (the ChatGPT
subscription auth) and ``alembic_version`` are intentionally preserved.

    python -m app.cli seed-demo            # reset + seed (default)
    python -m app.cli seed-demo --no-reset # add demo data without wiping
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.company import Company
from app.models.context import Context
from app.models.observation import Observation
from app.models.person import Person
from app.models.project import Project
from app.models.relationship import Relationship
from app.models.task import Task
from app.models.user import AppUser
from app.security import hash_password

# Wiped on reset. Everything except ``alembic_version`` (schema version) and
# ``oauth_credential`` (so the OpenAI sign-in survives a reset). CASCADE clears
# dependent rows; RESTART IDENTITY resets any serial sequences.
_WIPE_TABLES = [
    "audit_log",
    "agent_run",
    "outbox_event",
    "chunk",
    "entity_link",
    "entity_tag",
    "task_link",
    "relationship",
    "observation",
    "task",
    "project",
    "person",
    "company",
    "context",
    "tag",
    "app_user",
]

_NOW = datetime.now(tz=UTC)
_TODAY = _NOW.date()


def _days(offset: int) -> date:
    return _TODAY + timedelta(days=offset)


# (slug, name, category, description)
_CONTEXTS = [
    ("work", "Helios Robotics", "work", "Building the company — warehouse robotics"),
    ("personal", "Personal", "personal", "Life outside work"),
    ("health", "Health & Fitness", "personal", "Training, climbing, sleep"),
    ("oss", "Open Source", "side", "Maintaining tide-ui and side projects"),
    ("learning", "Learning", "personal", "Books, courses, deliberate practice"),
]

# (slug, name, domain, notes)
_COMPANIES = [
    (
        "helios-robotics", "Helios Robotics", "helios.example",
        "Our company — autonomous warehouse fleets",
    ),
    ("northwind-analytics", "Northwind Analytics", "northwind.example", "Data platform partner"),
    ("meridian-health", "Meridian Health", "meridianhealth.example", "Pilot customer (logistics)"),
    ("lumen-ai", "Lumen AI", "lumen.example", "Foundation-model vendor"),
    ("atlas-ventures", "Atlas Ventures", "atlasvc.example", "Lead investor (Seed)"),
    (
        "brightwave-studio", "Brightwave Studio", "brightwave.example",
        "Brand & product design agency",
    ),
]

# (slug, name, role, company_slug|None, context_slug, email|None, first_met_offset, summary)
_PEOPLE = [
    (
        "maya-chen", "Maya Chen", "Co-founder & CTO", "helios-robotics", "work",
        "maya@helios.example", -900, "Co-founded Helios. Owns hardware + controls.",
    ),
    (
        "devon-okafor", "Devon Okafor", "Head of Product", "helios-robotics", "work",
        "devon@helios.example", -640, "Runs product and customer discovery.",
    ),
    (
        "priya-nair", "Priya Nair", "Staff Engineer", "helios-robotics", "work",
        "priya@helios.example", -610, "Leads the fleet-controller rewrite.",
    ),
    (
        "tomas-leroy", "Tomás Leroy", "Design Lead", "brightwave-studio", "work",
        "tomas@brightwave.example", -300, "Design partner for the v2 console.",
    ),
    (
        "sara-kim", "Sara Kim", "Partner", "atlas-ventures", "work",
        "sara@atlasvc.example", -210, "Led our seed. Quarterly board check-ins.",
    ),
    (
        "james-bell", "James Bell", "Data Lead", "northwind-analytics", "work",
        "james@northwind.example", -180, "Helping with the telemetry pipeline.",
    ),
    (
        "lina-haddad", "Lina Haddad", "VP Engineering", "lumen-ai", "work",
        "lina@lumen.example", -150, "Owns the model partnership.",
    ),
    (
        "grace-liu", "Grace Liu", "Program Manager", "meridian-health", "work",
        "grace@meridianhealth.example", -95, "Main contact for the pilot rollout.",
    ),
    (
        "omar-farouk", "Omar Farouk", "Technical Recruiter", "lumen-ai", "work",
        None, -70, "Reached out about a senior controls role.",
    ),
    (
        "hannah-stern", "Hannah Stern", "Mentor", "atlas-ventures", "work",
        "hannah@atlasvc.example", -520, "Operator-turned-investor. Monthly 1:1s.",
    ),
    (
        "noah-weber", "Noah Weber", "Friend", None, "personal",
        None, -2200, "Old university friend. Backpacking buddy.",
    ),
    (
        "ines-costa", "Inés Costa", "Climbing partner", None, "health",
        None, -400, "Weekly bouldering sessions.",
    ),
    (
        "raj-patel", "Raj Patel", "OSS contributor", None, "oss",
        None, -120, "Top contributor to tide-ui. Reviews PRs.",
    ),
    (
        "leo-martins", "Leo Martins", "Founder (peer)", None, "work",
        None, -260, "Runs a peer founder group we both attend.",
    ),
]

# (slug, title, context_slug, status, purpose)
_PROJECTS = [
    (
        "helios-v2-launch", "Helios v2 Launch", "work", "active",
        "Ship the v2 fleet controller to the Meridian pilot.",
    ),
    (
        "series-a-raise", "Series A Raise", "work", "active",
        "Close the Series A by end of Q3.",
    ),
    (
        "tide-ui-1-0", "tide-ui 1.0", "oss", "active",
        "Cut the first stable release of the component library.",
    ),
    (
        "home-office", "Home Office Setup", "personal", "on_hold",
        "Standing desk, acoustic panels, better lighting.",
    ),
]

# (title, status, priority, due_offset|None, context_slug|None, project_slug|None)
_TASKS = [
    ("Send the Series A deck to Sara", "open", "high", -1, "work", "series-a-raise"),
    ("Review Priya's fleet-controller RFC", "in_progress", "high", 0, "work", "helios-v2-launch"),
    ("Confirm Meridian pilot start date with Grace", "open", "high", 1, "work", "helios-v2-launch"),
    ("Draft the Q3 board update", "open", "normal", 2, "work", None),
    ("Sign the Lumen model agreement", "open", "high", 3, "work", None),
    ("Tag tide-ui 1.0-rc1 and write release notes", "open", "normal", 4, "oss", "tide-ui-1-0"),
    ("Triage open tide-ui issues with Raj", "open", "low", 6, "oss", "tide-ui-1-0"),
    ("Book the Q3 offsite venue", "open", "normal", 9, "work", None),
    ("Reply to Omar about the controls role", "open", "low", 1, "work", None),
    ("Plan a climbing trip with Inés", "open", "low", 12, "health", None),
    ("Order a standing desk", "open", "normal", None, "personal", "home-office"),
    ("Finish DDIA chapter 9", "in_progress", "low", 14, "learning", None),
    ("Ship telemetry pipeline v1 with James", "done", "high", -3, "work", "helios-v2-launch"),
    ("Onboard Tomás to the design system", "done", "normal", -6, "work", "helios-v2-launch"),
    ("Renew the SSL certs", "done", "normal", -8, "work", None),
    ("Schedule a monthly 1:1 with Hannah", "done", "low", -5, "work", None),
]

# (subject_slug, subject_type, days_ago, kind, body)
_OBSERVATIONS = [
    ("sara-kim", "person", 1, "meeting",
     "Board prep call — wants the deck a week before the round opens."),
    ("priya-nair", "person", 0, "note",
     "RFC looks strong; flagged the failover path for review."),
    ("grace-liu", "person", 2, "meeting",
     "Meridian leaning toward a mid-quarter pilot start. Needs the SOC2 summary."),
    ("maya-chen", "person", 3, "note",
     "Aligned on cutting scope for v2 — defer multi-site to v2.1."),
    ("lina-haddad", "person", 5, "meeting",
     "Lumen agreement nearly final; legal redlines back this week."),
    ("omar-farouk", "person", 6, "note",
     "Senior controls role, remote-friendly. Said I'd reply by Friday."),
    ("raj-patel", "person", 4, "note",
     "Volunteered to own the docs site for the 1.0 release."),
    ("helios-v2-launch", "project", 1, "milestone",
     "Telemetry pipeline v1 merged — dashboards live for the team."),
    ("series-a-raise", "project", 2, "note",
     "Target raise sized; building the data room this week."),
    ("tide-ui-1-0", "project", 4, "milestone",
     "Component API frozen for 1.0. Only docs + a11y left."),
]

# (from_slug, to_slug, type, context_slug|None)
_RELATIONSHIPS = [
    ("maya-chen", "priya-nair", "colleague", "work"),
    ("maya-chen", "devon-okafor", "colleague", "work"),
    ("sara-kim", "hannah-stern", "colleague", "work"),
    ("noah-weber", "ines-costa", "friend", "personal"),
    ("raj-patel", "priya-nair", "collaborator", "oss"),
    ("leo-martins", "maya-chen", "peer", "work"),
]


async def _wipe(db: AsyncSession) -> None:
    await db.execute(text(f"TRUNCATE {', '.join(_WIPE_TABLES)} RESTART IDENTITY CASCADE"))


async def seed_demo(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    name: str = "Alex Rivera",
    reset: bool = True,
) -> dict[str, int]:
    """Seed the fictional demo dataset. Returns a count of rows created per kind."""
    if reset:
        await _wipe(db)

    db.add(AppUser(email=email, name=name, password_hash=hash_password(password), settings={}))

    contexts: dict[str, Context] = {}
    for slug, nm, category, desc in _CONTEXTS:
        contexts[slug] = Context(
            slug=slug, name=nm, category=category, description=desc, status="active"
        )
        db.add(contexts[slug])

    companies: dict[str, Company] = {}
    for slug, nm, domain, notes in _COMPANIES:
        companies[slug] = Company(slug=slug, name=nm, domain=domain, notes=notes)
        db.add(companies[slug])
    await db.flush()

    people: dict[str, Person] = {}
    for slug, nm, role, comp, ctx, mail, met_off, summary in _PEOPLE:
        people[slug] = Person(
            slug=slug,
            name=nm,
            role=role,
            company_id=companies[comp].id if comp else None,
            primary_context_id=contexts[ctx].id,
            email=mail,
            first_met=_days(met_off),
            summary=summary,
        )
        db.add(people[slug])

    projects: dict[str, Project] = {}
    for slug, title, ctx, status, purpose in _PROJECTS:
        projects[slug] = Project(
            slug=slug, title=title, context_id=contexts[ctx].id, status=status, purpose=purpose
        )
        db.add(projects[slug])
    await db.flush()

    tasks: list[Task] = []
    for title, status, priority, due_off, ctx, proj in _TASKS:
        task = Task(
            title=title,
            status=status,
            priority=priority,
            due=_days(due_off) if due_off is not None else None,
            context_id=contexts[ctx].id if ctx else None,
            project_id=projects[proj].id if proj else None,
            completed_at=_NOW - timedelta(days=1) if status == "done" else None,
        )
        tasks.append(task)
        db.add(task)

    observations: list[Observation] = []
    for subj_slug, subj_type, days_ago, kind, body in _OBSERVATIONS:
        subject = people[subj_slug] if subj_type == "person" else projects[subj_slug]
        obs = Observation(
            subject_type=subj_type,
            subject_id=subject.id,
            date=_days(-days_ago),
            kind=kind,
            body=body,
            source="demo",
        )
        observations.append(obs)
        db.add(obs)

    for from_slug, to_slug, rel_type, ctx in _RELATIONSHIPS:
        db.add(
            Relationship(
                from_person_id=people[from_slug].id,
                to_person_id=people[to_slug].id,
                type=rel_type,
                context_id=contexts[ctx].id if ctx else None,
            )
        )
    await db.flush()

    # A small recent activity feed for the dashboard (newest first when ordered
    # by created_at desc). Mixes user (ui) and agent (chat/capture) surfaces.
    feed = [
        ("agent", "create", "task", tasks[2], "capture", 2),
        ("user", "update", "project", projects["helios-v2-launch"], "ui", 5),
        ("agent", "create", "observation", observations[0], "chat", 7),
        ("user", "create", "person", people["grace-liu"], "ui", 20),
        ("agent", "update", "task", tasks[1], "chat", 26),
        ("user", "create", "task", tasks[0], "ui", 30),
        ("agent", "create", "observation", observations[2], "capture", 33),
        ("user", "update", "company", companies["lumen-ai"], "ui", 48),
    ]
    for actor, action, entity_type, entity, surface, hours_ago in feed:
        label = getattr(entity, "title", None) or getattr(entity, "name", None) or entity_type
        audit = AuditLog(
            actor=actor,
            action=action,
            entity_type=entity_type,
            entity_id=getattr(entity, "id"),  # noqa: B009 — heterogeneous entity types
            after={"label": label},
            surface=surface,
        )
        audit.created_at = _NOW - timedelta(hours=hours_ago)
        db.add(audit)
    await db.flush()

    return {
        "contexts": len(_CONTEXTS),
        "companies": len(_COMPANIES),
        "people": len(_PEOPLE),
        "projects": len(_PROJECTS),
        "tasks": len(_TASKS),
        "observations": len(_OBSERVATIONS),
        "relationships": len(_RELATIONSHIPS),
        "activity": len(feed),
    }
