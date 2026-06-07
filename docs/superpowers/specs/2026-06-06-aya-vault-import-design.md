# Aya vault → Postgres full-fidelity import — design

**Date:** 2026-06-06
**Branch:** `feat/aya-vault-import`
**Status:** Approved (design)

## Goal

Get the real `~/brain/aya` Obsidian vault into the Postgres database with high
fidelity — people, companies, contexts, projects, tasks, relationships (plus the
existing extras: observations, journal, knowledge, telos). The database
currently holds only **demo-seed data**; the real vault has effectively never
been imported. This work extends the existing importer with fidelity fixes and
safety modes, drives the changes with TDD, then runs the import.

## Background

- **Importer already exists:** [backend/scripts/import_aya.py](../../../backend/scripts/import_aya.py),
  committed in `308a1ad`, with a fixture-based test
  [backend/tests/test_import_aya.py](../../../backend/tests/test_import_aya.py).
  It walks the vault, parses frontmatter (`python-frontmatter`), upserts by slug
  in FK order (contexts → companies → people → projects → tasks → observations →
  relationships → journal → knowledge → telos), and reindexes for search. It is
  idempotent.
- **Infra is up:** Postgres (pgvector) and Neo4j containers are healthy. DB is
  `mc` (`DATABASE_URL` in `backend/.env`), tests use `mc_test`.
- **Current DB = demo seed, not the vault.** Row counts: person 14
  (fictional — Devon Okafor, Maya Chen…), context 5 (Helios Robotics…), company
  6, task 16, project 4, journal/knowledge/telos 0. The vault has 298 people, 37
  tasks, 23 journal, 57 knowledge.
- **Relevant models:** `Person` (slug unique, `company_id` FK, `primary_context_id`
  FK, `summary`), `Context` (slug unique, `category`, `color`), `Company` (slug),
  `Project` (slug, `context_id`), `Task` (`source`, `context_id`),
  `Observation` (`subject_type`/`subject_id`, `kind`, `body`, `source`),
  `Relationship` (`from_person_id`, `to_person_id`, `type`; unique on the triple).
- **Graph:** Postgres is the source of truth; a Neo4j projector
  ([backend/app/graph](../../../backend/app/graph)) rebuilds the graph from
  Postgres. Relationship edges only appear in the graph after a rebuild.

## Vault data realities (measured across all 298 people files)

- **Frontmatter:** 293 YAML-fenced, 5 bare/heading-style. 2 files are
  multi-block (`fred-plais.md`, `fabien-potencier.md`) — a `#` h1 + bare keys,
  then a second block using `###` sub-headings.
- **Context tags on people:** `contexts: work` (281), `personal` (20),
  `upsun` (1). These are mostly *categories*, not context slugs.
- **Company on people:** `Upsun` (276), then a long tail (Société Générale,
  Pinterest, Schlumberger, Vaimo, Strix, Lagardère…), plus noise values
  (`null`, empty, key-like `role:`/`email:` from the bare files).
- **Contexts:** 5 real ones — `upsun`, `number6`, `gaal`, `side-projects`,
  `personal`.
- **Projects:** only `upsun/projects` (1) and `personal/projects` (1) have files
  → **2 projects total**. Small because the source is small.
- **Relationships:** 7 people have a Relationships section, **15 bullet lines**
  total. Patterns: `parent_of` (6), `connected_to` (4), `married_to` (2),
  `spouse` (1), `employee_context` (1), and exactly **1** that links to another
  vault person (`reports_to: [fabien-potencier](02.people/fabien-potencier.md)`).
  Targets are otherwise plain names of people with no file (children, spouses,
  friends).

The headline: small project/relationship counts reflect small source data, not a
bug. The dense relation is **employment** (276 → Upsun), carried by `company_id`.

## What we build

### 1. Context resolution (affects all 298 people + tasks)

A shared helper resolves a `primary_context_id` / task `context_id` by trying, in
order:

1. the `contexts:`/`context:` value(s) that match a known context slug
   (`personal`, `upsun`);
2. else `slugify(company)` that matches a known context slug (`Upsun` → `upsun`);
3. else `NULL`.

This links ~296/298 people to a context instead of ~21.

### 2. Company sanitization

Ignore `company:` values that are empty, `null`, or key-like (`^\w+:$`) so we do
not create junk company rows. Affects ~15 noisy values.

### 3. Relationship handling → real People + graph edges

For each bullet under `##` **or** `###` "Relationships", parse
`type: target(s) [; context: …]`, then for each target:

1. **Linked vault person** (`[slug](02.people/slug.md)`) → edge to that person.
2. **Plain name** (`Helene`, `Erwan`, `Youssef`) → **find-or-create a stub
   `Person`** (slug = slugified name); the `; context: …` clause becomes that
   person's `summary`. Then create the `Relationship` edge.
3. **Multiple names in one bullet** (`A, B, C`) → split on commas → one stub
   Person + one edge each.

**Name guard** — a target only becomes a Person if it *looks like a name*:
non-empty, not `unknown`/`name unknown`/`n/a`/`tbd`, ≤ 5 words, and no
mid-string sentence period. This drops `spouse: name unknown` and the
descriptive `Employee context: Upsun, Finance, Legal & Corporate Services.
Reporting line unknown.` (employment already captured via `company_id`). Skipped
lines are **listed in the run report** — nothing disappears silently.

Edges are stored `from_person` (file owner) → `to_person` (target), `type` =
normalized label, deduped by the existing unique `(from, to, type)`. After
import, the Neo4j graph is rebuilt so the new edges appear there too.

**Provenance:** stubs are plain minimal `Person` rows (name + summary). No
`is_stub`/`origin` column is added (avoids a migration). A marker can be added
later if filtering "real file" vs "mentioned-only" people becomes useful.

Net effect: ~12–13 new stub people (people ≈ 310) and ~14 edges (up from 1).

### 4. Multi-block / heading-depth robustness

`_extract_section` matches a section name at any heading depth (`##`/`###`/`####`).
For the 2 bare multi-block files, all blocks are parsed and their
observations/relationships merged onto the one person (keyed by file slug).

### 5. Safety modes (new CLI flags)

- `--dry-run` — parse and stage all writes, print the report, then commit
  **nothing** (zero net writes). The importer today commits per phase, so dry-run
  requires threading the flag through so the phase functions `flush` (to resolve
  FK ids in-session) but skip `commit`, and the session is rolled back at the end.
  Used to preview the real-vault numbers before committing.
- `--reset` — before importing, truncate the importer-owned tables in FK-safe
  order: `relationship, observation, task, project, person, company, context,
  journal_entry, knowledge, telos`. **Does not** touch user/auth/agent tables.
  This delivers the "wipe demo seed, import clean" outcome.

Existing flags/behavior retained: `--vault` (default `/Users/nls/brain/aya`),
search reindex at the end.

## Expected result after a clean `--reset` import

| Entity | Expected |
|---|---|
| contexts | 5 |
| companies | ~7 (post-sanitization) |
| people | ~310 (298 files + ~12 stubs) |
| projects | 2 |
| tasks | 37 |
| observations | hundreds |
| relationships | ~14 |
| journal / knowledge / telos | 23 / 57 / parsed |

## Testing (TDD)

Extend `backend/tests/fixtures/aya_vault/` and add failing-then-passing tests in
`test_import_aya.py`, run against `mc_test`:

- context resolution: `contexts: work` + `company: Upsun` → linked to `upsun`;
  `contexts: personal` → `personal`; unknown company → `NULL`.
- company sanitization: `null`/empty/key-like values produce no company row.
- relationship → stub person + edge; multi-name bullet → N people + N edges;
  `; context:` → stub summary; name guard drops `name unknown` / descriptive
  lines (asserted via the skipped-report list).
- `###`-heading relationships and a multi-block bare file parse correctly.
- `--dry-run` leaves row counts unchanged; `--reset` clears prior rows first.

## Execution sequence

1. New branch off `main`: `feat/aya-vault-import` (done).
2. TDD the changes above; full backend test suite green.
3. `--dry-run` against the real vault; review counts together.
4. `--reset` real import into `mc`.
5. Rebuild the Neo4j graph (projector) so relationship edges appear.
6. Verify final counts and spot-check a few people (Fred Plais's context,
   fabien `reports_to`, a couple of stub children).

## Out of scope

- Task → project linking (no source signal: task `projects:` is empty).
- Meetings, inbox, tones, reviews sections (no importer/target table yet).
- A schema column to mark stub people.
- Any frontend change.
