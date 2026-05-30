# mission-control — Specification

> Status: **Design approved, not yet implemented.**
> Audience: an engineer (or another Claude instance) implementing this from scratch.
> Source of this design: distilled from the existing `aya` markdown vault (`~/brain/aya`), whose entities define the data model.

---

## Table of contents

1. [Overview](#1-overview)
2. [Goals & non-goals](#2-goals--non-goals)
3. [Confirmed decisions](#3-confirmed-decisions)
4. [Tech stack](#4-tech-stack)
5. [Architecture](#5-architecture)
6. [Data model — Postgres](#6-data-model--postgres)
7. [Graph model — Neo4j](#7-graph-model--neo4j)
8. [Search & embeddings — pgvector](#8-search--embeddings--pgvector)
9. [Audit log & undo](#9-audit-log--undo)
10. [AI system](#10-ai-system)
11. [HTTP API](#11-http-api)
12. [Frontend](#12-frontend)
13. [Auth](#13-auth)
14. [Migration from aya](#14-migration-from-aya)
15. [Repository layout](#15-repository-layout)
16. [Configuration](#16-configuration)
17. [Deployment](#17-deployment)
18. [Testing](#18-testing)
19. [Delivery phases](#19-delivery-phases)
20. [Future / out of scope](#20-future--out-of-scope)

---

## 1. Overview

mission-control is a **single-user, self-hosted web app** that becomes the central system of record for G's life across all devices. It replaces the `aya` markdown vault as the source of truth while preserving aya's concepts (contexts, people, tasks, journal, knowledge, TELOS, tones).

It provides:

- **Full CRUD UI** for every entity.
- An **AI agent** (LangChain) that queries and mutates the same data — the successor to the Pi/aya chat experience — via chat, natural-language quick-capture, and voice.

The app is the human interface; the AI is a second interface over the *same* domain services, so both paths share validation, audit, and undo.

---

## 2. Goals & non-goals

### Goals
- One central place, reachable from all devices (responsive web/PWA).
- Postgres-canonical data with a synced Neo4j graph for relationship/graph reasoning.
- Semantic search across everything via pgvector.
- AI that can both read and write data autonomously, with a full reversible audit trail.
- A clean one-time migration from the aya markdown vault.

### Non-goals (v1)
- Multi-user / multi-tenant. **Single user only.**
- Offline-first / offline write queue. Responsive online web now; native/offline later.
- Detailed fitness/nutrition tracking. **Detailed health data stays in Google Health.** mission-control only does *light* habit tracking. (A read-only Google Health/Fit import is a future enhancement, not in v1.)
- Proactive/cron agent routines (morning brief, automated daily/weekly reviews). Reviews are available *on demand* in v1; automation is future.
- Two-way markdown sync. Migration is a **one-time import**; the vault becomes a read-only archive.

---

## 3. Confirmed decisions

| Topic | Decision |
|---|---|
| Source of truth | Migrate aya markdown → Postgres once; Postgres is canonical; vault archived |
| Users | Single user |
| Hosting | Self-hosted VPS, web/PWA from all devices |
| Backend | Python-only: FastAPI serves both CRUD and AI |
| Frontend | TanStack (pure client SPA) talking to the FastAPI JSON API |
| ORM / migrations | SQLAlchemy 2.0 + Alembic (Drizzle dropped — no TS server) |
| Datastores | Postgres (canonical) + Neo4j (graph projection) + pgvector (search) from day one |
| AI surfaces | Chat panel, quick-capture parsing, voice |
| AI write policy | Autonomous + full audit log, reversible |
| Agent shape | One LangChain agent with domain-mapped tools + semantic/graph retrieval |
| Carried-over concepts | Contexts & projects, TELOS, reviews rhythm, writing tones, inbox |

---

## 4. Tech stack

**Frontend**
- React 19 + TypeScript, built with Vite.
- TanStack Router (file-based), TanStack Query (server state), TanStack Table, TanStack Form.
- Tailwind CSS + shadcn/ui (Radix primitives) for components.
- Zod for client-side schema/validation.
- `vite-plugin-pwa` for installability (offline write queue deferred).

**Backend**
- Python 3.12+, FastAPI, Uvicorn.
- SQLAlchemy 2.0 (async, `asyncpg`) + Alembic migrations.
- Pydantic v2 for request/response schemas and settings.
- LangChain (+ LangGraph optional) for the agent; provider-agnostic, default Anthropic Claude for the LLM.
- Embeddings via configurable provider (default OpenAI `text-embedding-3-small`, 1536 dims).
- Neo4j Python driver.
- STT via configurable provider (default OpenAI Whisper API) for voice.

**Datastores / infra**
- PostgreSQL 16 + `pgvector` extension.
- Neo4j 5 (community).
- Object storage for attachments: local disk volume (S3-compatible optional).
- Docker Compose; Caddy reverse proxy (automatic TLS).

**Background work**
- A single `worker` process that (a) drains the transactional outbox into Neo4j and (b) processes embedding jobs. Polling-based; no Redis required at single-user scale (add ARQ+Redis only if needed).

---

## 5. Architecture

```
                 ┌─────────────────────────────────────────────┐
                 │  TanStack client (React SPA, PWA-capable)    │
                 │  routes per domain · Cmd-K capture · chat    │
                 └───────────────────────┬─────────────────────┘
                                         │ REST/JSON + session cookie
                                         ▼
        ┌────────────────────────────────────────────────────────────┐
        │                          FastAPI                            │
        │  api/        domain routers (CRUD)                          │
        │  agent/      chat · capture · voice endpoints               │
        │      │                                                      │
        │      ▼                                                      │
        │  services/   domain services  ◄── single write path ──┐    │
        │      │   (validation, business rules)                 │    │
        │      ├── audit/    write before/after to audit_log    │    │
        │      └── outbox    enqueue graph change events        │    │
        └──────┬──────────────────────────────────┬─────────────┘    │
               │                                  │ tools             │
               ▼                                  ▼                   │
        ┌──────────────┐                  ┌────────────────┐          │
        │ Postgres     │                  │ LangChain agent│──────────┘
        │  + pgvector  │◄── semantic ─────│  domain tools  │
        │ (canonical)  │    search        │  graph_query   │
        └──────┬───────┘                  └────────────────┘
               │ outbox events (polled)
               ▼
        ┌──────────────┐        ┌──────────────┐
        │   worker     │───────▶│    Neo4j     │
        │ outbox+embed │ Cypher │  (graph)     │
        └──────────────┘  MERGE └──────────────┘
```

**Key invariant:** every mutation — whether from the UI or the agent — flows through a **domain service**. The agent never issues raw SQL. Domain services are the only writers, and they: validate → persist (Postgres) → write an `audit_log` row → enqueue an `outbox_event` → (optionally) enqueue an embedding job. This guarantees UI and AI share identical validation, audit, undo, graph-sync, and indexing behaviour.

---

## 6. Data model — Postgres

Conventions:
- Primary keys: `id uuid` (UUIDv7-style, time-sortable) unless noted.
- Timestamps: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (touch on update).
- Human-friendly unique `slug text` where entities are referenced by name.
- Single-user: no `user_id` scattered across tables (one tenant). Only `app_user` exists for auth.
- "Generic" tables use a polymorphic `(subject_type text, subject_id uuid)` pair, enforced in the application layer (no DB FK), with a composite index.
- Enum-like columns are stored as `text` with a CHECK constraint listing allowed values (easy to evolve; documented per field below).

### 6.1 Auth
**`app_user`** — single row expected.
- `id uuid pk`
- `email text unique not null`
- `name text`
- `password_hash text` (Argon2) — nullable if using passkey only
- `webauthn_credentials jsonb` (optional passkeys)
- `settings jsonb` (UI prefs, defaults)
- timestamps

### 6.2 Structural backbone
**`context`** — stable life/work areas (personal, upsun, gaal, number6, side-projects).
- `id`, `slug unique`, `name`, `category text` (`work|personal|side|other`), `description text`, `status text` (`active|archived`, default `active`), timestamps.

**`project`** — nested in a context.
- `id`, `context_id fk→context`, `slug unique`, `title`, `status text` (`active|on_hold|complete|archived`), `purpose text`, `body text` (markdown), timestamps.

### 6.3 Personal CRM
**`company`** — promoted to a first-class entity so the graph can answer "who do I know at X".
- `id`, `slug unique`, `name`, `domain text` (website), `notes text`, timestamps.

**`person`**
- `id`, `slug unique`, `name not null`, `role text`, `company_id fk→company null`, `email text`, `linkedin text`, `first_met date`, `primary_context_id fk→context null`, `summary text` (markdown "Context" section), `archived bool default false`, timestamps.

**`relationship`** — directed people-graph edge (also surfaces in Neo4j).
- `id`, `from_person_id fk→person`, `to_person_id fk→person`, `type text` (suggested vocabulary: `colleague|friend|family|mentor|mentee|manager|reports_to|partner|acquaintance|knows`), `context_id fk→context null`, `since date`, `notes text`, timestamps.
- Unique on `(from_person_id, to_person_id, type)`.

> Person→Company "works at" is modelled via `person.company_id` (and projected as a `WORKS_AT` edge). Add a `person_company_history` table later if past employers matter.

### 6.4 Tasks
**`task`**
- `id`, `title not null`, `status text` (`open|in_progress|done|archived`, default `open`), `priority text` (`low|normal|high`, default `normal`), `due date null`, `scheduled date null`, `context_id fk→context null`, `project_id fk→project null`, `outcome text` (success definition), `body text` (markdown: context, acceptance criteria, notes), `source text` (free text or link to origin), `completed_at timestamptz null`, timestamps.

**`task_link`** — related tasks (self M:N).
- `id`, `from_task_id fk→task`, `to_task_id fk→task`, `kind text` (`related|blocks|duplicates`, default `related`). Unique `(from_task_id, to_task_id, kind)`.

### 6.5 Journal & reviews
**`journal_entry`** — the daily note (one per date).
- `id`, `date date unique not null`, `summary text` (daily review prose), `mood smallint null` (1–5), `energy smallint null` (1–5), `telos_alignment text`, `body text` (markdown for anything unstructured), timestamps.

**`journal_log`** — timestamped log lines within a day.
- `id`, `journal_entry_id fk→journal_entry`, `at time` (or `timestamptz`), `text not null`, `created_at`.

**`review`** — weekly/monthly review artifacts (daily review == `journal_entry`).
- `id`, `kind text` (`weekly|monthly`), `period_start date`, `period_end date`, `body text` (markdown), `telos_alignment text`, timestamps.
- Unique `(kind, period_start)`.

### 6.6 Habits (light) & metrics
**`habit`**
- `id`, `name not null`, `description text`, `cadence text` (`daily|weekly|custom`), `target_per_period smallint null` (e.g. 5 = 5×/week), `context_id fk→context null`, `active bool default true`, timestamps.

**`habit_log`** — one row per habit per day acted on.
- `id`, `habit_id fk→habit`, `date date not null`, `status text` (`done|skip|partial`), `value numeric null` (optional, e.g. minutes), `note text`, `created_at`.
- Unique `(habit_id, date)`. Streaks computed in queries.

**`metric`** — minimal manual logging only (e.g. weight); detailed health stays in Google Health.
- `id`, `date date not null`, `type text` (`weight|...` free), `value numeric not null`, `unit text`, `source text` (`manual|google_health` future), `created_at`.

### 6.7 Meetings
**`meeting`**
- `id`, `title not null`, `date date not null`, `context_id fk→context`, `project_id fk→project null`, `summary text` (executive summary), `source text` (`transcript|summary|conversation`), `transcript text`, `body text` (markdown: key points, decisions, open questions sections if not normalised), timestamps.

**`meeting_participant`** — M:N person↔meeting.
- `id`, `meeting_id fk→meeting`, `person_id fk→person`, `role text null`. Unique `(meeting_id, person_id)`.

> Decisions / key points are stored as `observation` rows attached to the meeting (kind `decision|key_point|open_question`). Follow-ups become `task` rows with `source` linking back to the meeting (via `entity_link`).

### 6.8 Knowledge
**`knowledge_source`** — raw captured material (`04.knowledge/raw`).
- `id`, `slug unique`, `title not null`, `source_type text` (`arxiv|article|video|website|book|document|other`), `url text`, `author text`, `published date null`, `captured date`, `description text`, `body text` (original/excerpted content + structured takeaways), timestamps.

**`knowledge_note`** — synthesized wiki note (`04.knowledge/wiki`).
- `id`, `slug unique`, `title not null`, `type text` (`concept|framework|synthesis|entity`), `status text` (`active|draft|archived`, default `active`), `body text` (markdown), timestamps.

**`knowledge_citation`** — wiki note → source.
- `id`, `note_id fk→knowledge_note`, `source_id fk→knowledge_source null`, `url text null`, `quote text null`.

### 6.9 TELOS
**`telos`** — singleton (one active row).
- `id`, `purpose text`, `mission text`, `priority_order text`, `body text` (full markdown of the doc for fidelity), `review_cadence text`, `last_review date`, timestamps.

**`goal`**
- `id`, `code text` (e.g. `G1`), `domain text` (`work|gaal|side|personal`), `text not null`, `status text` (`active|done|dropped`, default `active`), `metric text`, `target text`, timestamps.

**`priority_block`** — recurring time blocks from TELOS frontmatter.
- `id`, `day text` (`mon..sun`), `start_time time`, `end_time time`, `label text`, `context_id fk→context null`.

**`telos_item`** — narratives/strategies/wisdom/etc.
- `id`, `kind text` (`narrative|strategy|wisdom|challenge|problem`), `code text`, `text not null`, `domain text null`.

### 6.10 Inbox & tones
**`inbox_item`** — lightweight "review later" queue (`00.inbox/review-later`).
- `id`, `title not null`, `source_type text` (`repo|article|tool|idea|video|other`), `url text`, `status text` (`queued|reviewed|archived`, default `queued`), `priority text` (`low|normal|high`), `note text` (why it mattered), timestamps.

**`tone`** — voice guides for AI external writing (`99.system/tones`).
- `id`, `slug unique`, `name`, `body text` (the voice guide), timestamps.

### 6.11 Cross-cutting generic tables
**`observation`** — aya's dated bullets, attachable to any entity.
- `id`, `subject_type text`, `subject_id uuid`, `date date`, `kind text` (`observation|preference|fact|open_loop|decision|key_point|open_question`), `body text not null`, `source text`, timestamps.
- Index `(subject_type, subject_id)`.

**`tag`** + **`entity_tag`** — polymorphic tagging.
- `tag`: `id`, `name unique`, `kind text null` (e.g. `context|domain|type`).
- `entity_tag`: `id`, `tag_id fk→tag`, `subject_type text`, `subject_id uuid`. Unique `(tag_id, subject_type, subject_id)`.

**`entity_link`** — preserves aya's free-form `related`/wikilink relationships.
- `id`, `from_type text`, `from_id uuid`, `to_type text`, `to_id uuid`, `kind text` (`related|source|mentions|...`), `created_at`. Index both endpoints.

**`audit_log`** — see §9.
- `id`, `actor text` (`user|agent|migration`), `action text` (`create|update|delete`), `entity_type text`, `entity_id uuid`, `before jsonb null`, `after jsonb null`, `surface text` (`ui|chat|capture|voice|api|migration`), `agent_run_id uuid null`, `reverted bool default false`, `created_at`.
- Index `(entity_type, entity_id)`, `(agent_run_id)`, `(created_at)`.

**`agent_run`** — one row per agent invocation (chat turn / capture / voice).
- `id`, `surface text`, `input text`, `transcript jsonb` (messages), `tool_calls jsonb`, `status text` (`ok|error`), `error text null`, `created_at`.

**`outbox_event`** — transactional outbox for Neo4j projection.
- `id`, `aggregate_type text`, `aggregate_id uuid`, `op text` (`upsert|delete`), `payload jsonb`, `processed_at timestamptz null`, `created_at`. Index on `processed_at is null`.

**`chunk`** — embeddings for semantic search (see §8).
- `id`, `subject_type text`, `subject_id uuid`, `chunk_index int`, `content text`, `embedding vector(1536)`, `updated_at`. Index `(subject_type, subject_id)` + ivfflat/hnsw on `embedding`.

**`attachment`** — files (`98.attachments`).
- `id`, `subject_type text null`, `subject_id uuid null`, `filename`, `content_type`, `size bigint`, `storage_key text` (disk/S3 path), `created_at`.

---

## 7. Graph model — Neo4j

Postgres remains canonical. Neo4j is a **derived projection** kept in sync via the transactional outbox.

**Nodes** (key property = Postgres `id`; carry denormalised display props like `name`, `slug`):
`Person`, `Company`, `Context`, `Project`, `Meeting`, `Task`, `KnowledgeNote`, `KnowledgeSource`, `Topic`, `Habit`.

**Relationships:**
- `(Person)-[:KNOWS {type, since}]->(Person)` — from `relationship`
- `(Person)-[:WORKS_AT]->(Company)`
- `(Person)-[:PARTICIPATED_IN]->(Meeting)`
- `(Project)-[:PART_OF]->(Context)`
- `(Meeting)-[:IN_CONTEXT]->(Context)`, `(Task)-[:IN_CONTEXT]->(Context)`, `(Person)-[:IN_CONTEXT]->(Context)`
- `(Task)-[:FOR_PROJECT]->(Project)`
- `(KnowledgeNote)-[:CITES]->(KnowledgeSource)`, `(KnowledgeNote)-[:ABOUT]->(Topic)`
- `(:any)-[:RELATES_TO {kind}]->(:any)` — from `entity_link`

**Sync mechanism (outbox + projector):**
1. Domain service writes Postgres rows and, in the **same transaction**, inserts an `outbox_event` (`aggregate_type`, `aggregate_id`, `op`, `payload`).
2. The `worker` polls unprocessed `outbox_event`s in order and applies idempotent Cypher `MERGE` (upsert) / `DETACH DELETE` (delete), then sets `processed_at`.
3. Idempotent MERGE keys on `id`, so replays are safe.
4. A `rebuild_graph` admin command can rebuild Neo4j from Postgres as a repair tool.

**Example graph queries the agent exposes:**
- "Who do I know at `<company>`?" → `MATCH (p:Person)-[:WORKS_AT]->(c:Company {slug:$slug}) RETURN p`
- "How am I connected to `<person>`?" → shortest path over `KNOWS`.
- "People I met in `<context>` this month" → `Meeting` + `PARTICIPATED_IN` + `IN_CONTEXT`.

---

## 8. Search & embeddings — pgvector

- Indexable entities: `person`, `project`, `task`, `journal_entry`, `meeting`, `knowledge_source`, `knowledge_note`, `observation`, `inbox_item`.
- On every create/update, the domain service enqueues an embedding job (via `outbox_event` of type `embed` or a dedicated jobs table). The worker:
  1. Renders the entity to a canonical text blob (title + key fields + body).
  2. Chunks it (e.g. ~800 tokens, overlap) when long.
  3. Embeds each chunk and upserts `chunk` rows (delete stale chunks for the subject first).
- Search: `semantic_search(query, types?, limit)` embeds the query and runs cosine ANN over `chunk`, returning subjects with scores; the API hydrates full entities.
- Hybrid option: combine pgvector ANN with Postgres full-text (`tsvector`) for keyword recall; rank-fuse. (Start with vector-only; add FTS if recall is weak.)
- Vector index: HNSW (`vector_cosine_ops`) preferred for quality at this scale.

---

## 9. Audit log & undo

Because AI writes are autonomous, **every** mutation is auditable and reversible.

- Domain services write an `audit_log` row for each create/update/delete with full `before`/`after` JSONB snapshots, the `actor`, the `surface`, and (for AI) the `agent_run_id`.
- **Undo a single change:** `POST /api/audit/{id}/revert` — applies the inverse:
  - `create` → delete the row
  - `update` → restore `before`
  - `delete` → re-insert `before`
  - marks the audit row `reverted = true` and writes a new compensating audit row.
- **Undo a whole agent action:** `POST /api/agent/runs/{agent_run_id}/revert` — reverts all of that run's audit rows in reverse order (so a quick-capture that created person+company+meeting+task can be undone in one click).
- Revert also enqueues outbox/embedding updates so the graph and index stay consistent.
- UI surfaces a toast after each AI write: "Aya created X · **Undo**".

---

## 10. AI system

### 10.1 Shape
A **single LangChain agent** (tool-calling; LangGraph optional for control flow) with:
- A **system prompt** = persona (SOUL-equivalent: warm, direct, protective of priorities) + operating rules + current date/context.
- A **toolset** grouped by domain (below). Tools wrap **domain services**, never raw SQL — so AI writes inherit validation + audit + outbox + embeddings.
- **Retrieval tools** for semantic and graph queries.

### 10.2 Tools (representative; one module per domain)
- Retrieval: `semantic_search(query, types?, limit)`, `graph_query(intent, params)` (safe, parameterised Cypher helpers: `who_at_company`, `connection_path`, `neighbors`, `meetings_with`).
- CRM: `find_person`, `create_person`, `update_person`, `add_observation`, `add_relationship`, `find_company`, `create_company`.
- Tasks: `find_tasks`, `create_task`, `update_task`, `complete_task`.
- Journal: `get_or_create_journal_entry(date)`, `append_journal_log`, `set_journal_summary`.
- Reviews: `create_review(kind, period)`.
- Habits: `list_habits`, `log_habit`, `create_habit`.
- Meetings: `create_meeting`, `add_participant`, `extract_followups` (creates tasks).
- Knowledge: `create_knowledge_source`, `create_knowledge_note`, `add_citation`.
- Inbox: `create_inbox_item`.
- TELOS: `get_telos`, `update_goal`.
- Writing: `get_tone(slug)`, `draft_external(tone, brief)`.
- Context/projects: `find_context`, `find_project`, `create_project`.

Each tool returns structured JSON (created/updated entity refs) so the agent can summarise precisely.

### 10.3 Surfaces
- **Chat** (`POST /api/agent/chat`): streaming, multi-turn; persists an `agent_run`. Can read and write.
- **Quick-capture** (`POST /api/agent/capture`): a single free-text string → the agent classifies and extracts → calls the relevant `create_*` tools (possibly several) → returns a capture summary `{ created: [...], agent_run_id }` with an undo token. Examples:
  - "met Sarah from Acme, follow up next week" → `create_company(Acme)` + `create_person(Sarah, company=Acme)` + `create_meeting` + `create_task(due=+7d)`.
  - "ran 5k this morning, felt good" → `log_habit(workout, done)` + optional `append_journal_log`.
- **Voice** (`POST /api/agent/voice`): audio upload → STT (Whisper) → text → quick-capture pipeline.

### 10.4 Write policy
Autonomous: the agent commits without per-write confirmation. Safety comes from the audit log + one-click undo (single change or whole run), not from confirmation prompts. All writes are logged with `surface` so AI-originated changes are filterable in an activity view.

---

## 11. HTTP API

REST/JSON under `/api`. Conventions: cursor or offset pagination, filtering by `context`, `project`, `tag`, `status`, date ranges; consistent envelopes; Pydantic schemas; OpenAPI auto-docs.

**CRUD resources** (standard `GET list`, `POST create`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`):
`/contexts`, `/projects`, `/people`, `/companies`, `/relationships`, `/tasks`, `/journal` (keyed by date), `/reviews`, `/habits`, `/habit-logs`, `/metrics`, `/meetings`, `/knowledge/sources`, `/knowledge/notes`, `/inbox`, `/telos`, `/goals`, `/tones`, `/observations`, `/tags`, `/links`, `/attachments`.

**Cross-cutting**
- `GET /search?q=&types=` — semantic search.
- `POST /graph/query` — structured graph intents.
- `GET /audit?entity=&surface=` , `POST /audit/{id}/revert`.
- `POST /agent/chat` (SSE stream), `POST /agent/capture`, `POST /agent/voice`, `GET /agent/runs/{id}`, `POST /agent/runs/{id}/revert`.
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- `POST /admin/rebuild-graph`, `POST /admin/reindex` (re-embed all).

---

## 12. Frontend

- **Shell:** left nav by domain; top bar with **Cmd-K quick-capture** (text) and a **voice button**; a docked, persistent **AI chat panel** (collapsible).
- **Routes / pages** (TanStack Router, file-based):
  - `/` dashboard — today: tasks due, journal entry, habits grid, recent AI activity, top-of-mind by context.
  - `/contexts`, `/contexts/$slug` (with its projects, people, meetings, tasks).
  - `/people`, `/people/$slug` — facts, observations timeline, relationships (with a small graph view), meetings, open loops.
  - `/companies`, `/companies/$slug`.
  - `/tasks` — list + board (by status), filters by context/project/priority/due.
  - `/journal` — calendar + daily editor (summary, mood/energy, log, telos alignment); `/journal/$date`.
  - `/reviews` — weekly/monthly.
  - `/habits` — habit grid with streaks; quick toggle per day.
  - `/meetings`, `/meetings/$id` — summary, participants, decisions, follow-up tasks, transcript.
  - `/knowledge` — sources + wiki notes, search-first; `/knowledge/$slug`.
  - `/inbox` — review-later queue.
  - `/telos` — goals, priority blocks, narratives.
  - `/tones`, `/settings`.
- **Data:** TanStack Query hooks per resource (generated from the OpenAPI client). Forms via TanStack Form + Zod. Tables via TanStack Table.
- **AI activity:** an "Activity" view listing `audit_log` filtered to `surface != ui`, each with an Undo button.

---

## 13. Auth

- Single account. Login with password (Argon2) or passkey (WebAuthn).
- Session cookie (HttpOnly, Secure, SameSite=Lax) or short-lived JWT + refresh; cookie preferred for a same-site SPA.
- All `/api/**` except `/auth/login` require an authenticated session.
- No registration flow in the UI; the single user is seeded via a CLI/admin command or env on first boot.

---

## 14. Migration from aya

A one-time, **idempotent** importer: `backend/scripts/import_aya.py --vault ~/brain/aya`. Re-runnable (upsert by slug). Uses `python-frontmatter` + a markdown parser.

**Order (respect FKs):**
1. `context` ← `03.contexts/*/INDEX.md`
2. `company` ← derived from distinct `person.company` values
3. `person` ← `02.people/*.md` (frontmatter → columns; `## Context` → `summary`)
4. `observation` ← parse `## Observations`, `## Preferences`, `## Open Loops` dated bullets per person (map to `kind`)
5. `relationship` ← parse `## Relationships` bullets (resolve `[name](02.people/x.md)` → person)
6. `project` ← `03.contexts/*/projects/*.md`
7. `task` ← `05.tasks/open` (status open) + `05.tasks/archive` (status done/archived); map frontmatter `priority/due/scheduled/contexts/projects/related/source`
8. `meeting` + `meeting_participant` ← `03.contexts/*/meetings/*.md` (resolve participant wikilinks); decisions/key-points → `observation`; follow-ups already exist as tasks → link
9. `journal_entry` + `journal_log` ← `01.journal/YYYY/*.md` (parse `## Log` lines into logs; `## Telos Alignment` → field; `## Health`/`## Food` → observations or habit_logs; `weight_kg` → `metric`)
10. `knowledge_source` ← `04.knowledge/raw/*.md`; `knowledge_note` (+`knowledge_citation`) ← `04.knowledge/wiki/**`
11. `telos`, `goal`, `priority_block`, `telos_item` ← `99.system/configuration/TELOS.md` (frontmatter blocks + sections)
12. `tone` ← `99.system/tones/*.md`
13. `inbox_item` ← `00.inbox/review-later/*.md`
14. `entity_link` ← all remaining `[label](path)` markdown links between entities; `tag`/`entity_tag` ← frontmatter `tags`
15. **Post-pass:** embed everything (`/admin/reindex`); project everything to Neo4j (`/admin/rebuild-graph`).

**Notes:**
- Filenames/slugs: reuse aya's kebab-case slugs as natural keys for idempotency.
- Preserve provenance: set `audit_log.surface = migration`.
- Keep the original markdown `body` verbatim in `body`/`transcript` fields where a structured mapping would lose fidelity.
- Wikilink resolver: map a vault path → `(entity_type, id)` via a path-prefix table (`02.people/` → person, etc.).
- Report unresolved links / unparsed files at the end; do not fail the whole run on a single bad file.

---

## 15. Repository layout

```
mission-control/
├── SPEC.md
├── docker-compose.yml
├── Caddyfile
├── .env.example
├── backend/
│   ├── pyproject.toml
│   ├── alembic/                 # migrations
│   ├── app/
│   │   ├── main.py              # FastAPI app, router wiring
│   │   ├── config.py            # pydantic-settings
│   │   ├── db.py                # async engine/session
│   │   ├── deps.py              # auth/session deps
│   │   ├── models/              # SQLAlchemy models (one module per domain)
│   │   ├── schemas/             # Pydantic request/response
│   │   ├── api/                 # routers per domain + agent + admin
│   │   ├── services/            # domain services (only writers) ← shared by api + agent
│   │   ├── audit/               # audit write + revert
│   │   ├── outbox/              # enqueue + types
│   │   ├── graph/               # neo4j client + projector + rebuild
│   │   ├── search/              # embeddings + pgvector queries + reindex
│   │   ├── agent/               # langchain agent, tools/, prompts/
│   │   └── worker.py            # outbox drain + embedding jobs
│   ├── scripts/import_aya.py
│   └── tests/
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── routes/              # TanStack Router file routes
        ├── components/          # shared UI (shadcn)
        ├── features/            # per-domain UI + query hooks
        ├── lib/                 # api client, query setup, auth
        └── main.tsx
```

---

## 16. Configuration

`.env` (see `.env.example`):
- `DATABASE_URL=postgresql+asyncpg://...`
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `LLM_MODEL=claude-...`
- `EMBEDDINGS_PROVIDER=openai`, `OPENAI_API_KEY`, `EMBEDDINGS_MODEL=text-embedding-3-small`, `EMBEDDINGS_DIM=1536`
- `STT_PROVIDER=openai`, `STT_MODEL=whisper-1`
- `SESSION_SECRET`, `INITIAL_USER_EMAIL`, `INITIAL_USER_PASSWORD`
- `ATTACHMENTS_DIR` or S3 creds
- `AYA_VAULT_PATH` (for the importer)

---

## 17. Deployment

- **Docker Compose** services: `caddy` (TLS reverse proxy), `frontend` (static build served by Caddy or a tiny nginx), `api` (FastAPI/uvicorn), `worker`, `postgres` (with pgvector image), `neo4j`.
- Caddy terminates TLS and routes `/` → frontend, `/api` → api.
- Volumes for Postgres data, Neo4j data, attachments.
- Migrations run on `api` start (Alembic upgrade head) or via a one-shot job.
- Single VPS; backups = `pg_dump` (canonical) + attachments volume. Neo4j is rebuildable from Postgres, so it is not part of the backup-critical path.

---

## 18. Testing

- **Backend:** `pytest` + `pytest-asyncio`; ephemeral Postgres (testcontainers or a compose test DB) with pgvector; Neo4j via testcontainer or a fake projector in unit tests.
  - Domain-service tests (validation, audit emission, outbox emission).
  - API tests (CRUD + auth).
  - Agent-tool tests with a mocked LLM (assert tool calls + resulting writes + undo).
  - Importer tests on a small fixture vault.
  - Undo/revert tests (create/update/delete inverses; whole-run revert).
- **Frontend:** Vitest + Testing Library for components/hooks; Playwright smoke e2e for core flows (create person, capture, undo).
- **CI:** lint (ruff/eslint), type-check (mypy/tsc), tests, build.

---

## 19. Delivery phases

Each phase is independently shippable. Acceptance criteria are concrete.

**P0 — Foundations**
- Compose stack (postgres+pgvector, neo4j, api, worker, frontend, caddy) boots.
- FastAPI skeleton, SQLAlchemy/Alembic, pydantic-settings, health endpoint.
- Auth (single user) + session; TanStack shell with nav, Cmd-K, chat placeholder.
- CI green.
- *Done when:* you can log in and see an empty dashboard served over TLS.

**P1 — Core CRUD + audit**
- `context`, `project`, `company`, `person`, `relationship`, `task` (+ `task_link`), generic `observation`/`tag`/`entity_link`.
- `audit_log` + single-change revert wired into all domain services.
- Full CRUD UI for the above.
- *Done when:* you can manage contexts/projects/people/tasks in the UI and undo any change.

**P2 — Daily life**
- `journal_entry`/`journal_log`, `review`, `telos`+`goal`+`priority_block`+`telos_item`, `habit`/`habit_log`/`metric`.
- Journal calendar + daily editor; habits grid with streaks; TELOS view.
- *Done when:* you can journal a day, log habits, and view goals/priority blocks.

**P3 — Knowledge, meetings, search**
- `meeting`+participants, `knowledge_source`/`knowledge_note`/`citation`, `inbox_item`, `tone`, `attachment`.
- `chunk` + embeddings worker; `/search` semantic search; global search UI.
- *Done when:* meetings & knowledge are CRUD-able and semantic search returns relevant entities across domains.

**P4 — Graph**
- `outbox_event` + worker projector; Neo4j nodes/edges; `rebuild_graph`.
- `/graph/query` intents + a relationships graph view on person pages.
- *Done when:* "who do I know at X" and connection paths work, and the graph stays in sync on writes.

**P5 — AI**
- LangChain agent + domain tools + retrieval tools; `agent_run`.
- Chat (streaming), quick-capture, voice (STT); autonomous writes with audit; whole-run undo; AI activity view.
- *Done when:* a free-text capture creates the right linked entities and is undoable in one click; chat can query and mutate.

**P6 — Migration**
- `import_aya.py` covering all entity types per §14; post-pass reindex + graph rebuild.
- *Done when:* a fresh DB imported from `~/brain/aya` reproduces people/tasks/journal/meetings/knowledge/TELOS with links intact, and the app is usable on real data.

---

## 20. Future / out of scope

- Proactive routines (morning brief, automated daily/weekly/monthly reviews on cron).
- Google Health/Fit read-only import (weight, steps, workouts) as AI/journal context.
- Offline-first PWA with a write queue; native mobile app.
- Multi-user / sharing.
- Two-way markdown export back to an Obsidian vault.
- External actions (sending email/LinkedIn) — kept manual until explicitly designed with confirmation gates.

---

## Appendix A — enum vocabularies (quick reference)

| Field | Values |
|---|---|
| `context.category` | work, personal, side, other |
| `context.status` / `project.status` | active, archived (project also: on_hold, complete) |
| `task.status` | open, in_progress, done, archived |
| `task.priority` / `inbox.priority` / `habit?` | low, normal, high |
| `relationship.type` | colleague, friend, family, mentor, mentee, manager, reports_to, partner, acquaintance, knows |
| `review.kind` | weekly, monthly |
| `habit.cadence` | daily, weekly, custom |
| `habit_log.status` | done, skip, partial |
| `meeting.source` | transcript, summary, conversation |
| `knowledge_source.source_type` | arxiv, article, video, website, book, document, other |
| `knowledge_note.type` | concept, framework, synthesis, entity |
| `observation.kind` | observation, preference, fact, open_loop, decision, key_point, open_question |
| `audit_log.actor` | user, agent, migration |
| `audit_log.action` | create, update, delete |
| `audit_log.surface` | ui, chat, capture, voice, api, migration |
| `outbox_event.op` | upsert, delete |
| `goal.domain` | work, gaal, side, personal |
| `telos_item.kind` | narrative, strategy, wisdom, challenge, problem |
