# P1.7 — Remaining entity pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** CRUD pages for the remaining entities — **Companies, Tags, Relationships, Observations, Entity-Tags, Entity-Links** — completing the manual UI for the whole data model. Includes a reusable `SubjectPicker` for the polymorphic `(subject_type, subject_id)` fields.

**Architecture:** Same foundation as P1.5/P1.6 (`resource()` + `makeResourceHooks`, pages = form + `DataTable` + edit/delete, `RequireAuth`+`AppShell`, undo via the Activity page). Entity-Tags and Entity-Links are immutable (create/list/delete — no edit). A `SubjectPicker` component renders a type `<Select>` plus a dependent id `<Select>` whose options come from the relevant entity list.

**Reference template (in repo, working):** `src/routes/{contexts,projects,people,tasks}.tsx`, `src/features/*/api.ts`, `src/components/{ui,DataTable,ConfirmButton}.tsx`, `src/lib/{resource,hooks,types}.ts`.

**Scope note:** Branch `feat/p1-frontend-crud`; run from `frontend/`. Full gate (`npm run test -- --run && npm run lint && npm run typecheck && npm run build`) at the end of EACH task. Omit empty optional FK/date fields from payloads (as in people.tsx/tasks.tsx). Client route paths: `/companies`, `/tags`, `/relationships`, `/observations`, `/entity-tags`, `/entity-links` (all proxied via `/api`).

---

### Task 1: Types + api modules for the remaining entities

**Files:** `frontend/src/lib/types.ts` (append), `frontend/src/features/{tags,relationships,observations,entityTags,entityLinks}/api.ts`

- [ ] **Step 1: Append to `src/lib/types.ts`:**

```ts
export interface Tag {
  id: string;
  name: string;
  kind: string | null;
  created_at: string;
  updated_at: string;
}
export interface TagCreate {
  name: string;
  kind?: string | null;
}
export type TagUpdate = Partial<TagCreate>;

export interface Relationship {
  id: string;
  from_person_id: string;
  to_person_id: string;
  type: string;
  context_id: string | null;
  since: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export interface RelationshipCreate {
  from_person_id: string;
  to_person_id: string;
  type?: string;
  context_id?: string | null;
  since?: string | null;
  notes?: string | null;
}
export type RelationshipUpdate = Partial<RelationshipCreate>;

export interface Observation {
  id: string;
  subject_type: string;
  subject_id: string;
  date: string | null;
  kind: string;
  body: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}
export interface ObservationCreate {
  subject_type: string;
  subject_id: string;
  body: string;
  kind?: string;
  date?: string | null;
  source?: string | null;
}
export type ObservationUpdate = Partial<ObservationCreate>;

export interface EntityTag {
  id: string;
  tag_id: string;
  subject_type: string;
  subject_id: string;
  created_at: string;
}
export interface EntityTagCreate {
  tag_id: string;
  subject_type: string;
  subject_id: string;
}

export interface EntityLink {
  id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  kind: string;
  created_at: string;
}
export interface EntityLinkCreate {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  kind?: string;
}
```

- [ ] **Step 2: api modules** (mirror `src/features/contexts/api.ts`):
  - `src/features/tags/api.ts` → `useTags/useCreateTag/useUpdateTag/useDeleteTag` (`/tags`, key `"tags"`, `Tag/TagCreate/TagUpdate`).
  - `src/features/relationships/api.ts` → `useRelationships/useCreateRelationship/useUpdateRelationship/useDeleteRelationship` (`/relationships`, key `"relationships"`).
  - `src/features/observations/api.ts` → `useObservations/useCreateObservation/useUpdateObservation/useDeleteObservation` (`/observations`, key `"observations"`).
  - `src/features/entityTags/api.ts` → `useEntityTags/useCreateEntityTag/useDeleteEntityTag` (resource `/entity-tags`, key `"entity-tags"`, `EntityTag/EntityTagCreate/EntityTagCreate`; only list/create/delete are used).
  - `src/features/entityLinks/api.ts` → `useEntityLinks/useCreateEntityLink/useDeleteEntityLink` (resource `/entity-links`, key `"entity-links"`, `EntityLink/EntityLinkCreate/EntityLinkCreate`).
  (For the immutable ones, you may still build all hooks via `makeResourceHooks`; just export the three used.)

- [ ] **Step 3:** Gate green. Commit: `feat(frontend): add types and hooks for remaining entities`

---

### Task 2: SubjectPicker component

**Files:** `frontend/src/components/SubjectPicker.tsx`, test `frontend/src/components/SubjectPicker.test.tsx`

- [ ] **Step 1: `src/components/SubjectPicker.tsx`**

```tsx
import { useCompanies } from "../features/companies/api";
import { useContexts } from "../features/contexts/api";
import { usePeople } from "../features/people/api";
import { useProjects } from "../features/projects/api";
import { useTasks } from "../features/tasks/api";
import { type Option, Select } from "./ui";

export const SUBJECT_TYPES = ["person", "project", "context", "task", "company"];

export function SubjectPicker({
  type,
  id,
  onChange,
}: {
  type: string;
  id: string;
  onChange: (type: string, id: string) => void;
}) {
  const people = usePeople();
  const projects = useProjects();
  const contexts = useContexts();
  const tasks = useTasks();
  const companies = useCompanies();

  const optionsByType: Record<string, Option[]> = {
    person: (people.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    project: (projects.data ?? []).map((p) => ({ value: p.id, label: p.title })),
    context: (contexts.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    task: (tasks.data ?? []).map((t) => ({ value: t.id, label: t.title })),
    company: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  };

  return (
    <div className="flex gap-2">
      <Select
        value={type}
        onChange={(t) => onChange(t, "")}
        options={SUBJECT_TYPES.map((t) => ({ value: t, label: t }))}
        placeholder="— type —"
      />
      <Select
        value={id}
        onChange={(i) => onChange(type, i)}
        options={type ? (optionsByType[type] ?? []) : []}
        placeholder="— select —"
      />
    </div>
  );
}
```

- [ ] **Step 2: Test `src/components/SubjectPicker.test.tsx`** — render in a `QueryClientProvider`; stub `fetch` so `/people`→`[{id:"p1",name:"Fabien",...}]` and the other lists→`[]`; pass `type="person"`, `id=""`, an `onChange` spy; assert the second select shows "Fabien" as an option (query the option text). Changing the type select calls `onChange` with the new type and empty id. (Mirror the `auth.test.tsx`/`hooks.test.tsx` provider+fetch-stub harness.)

- [ ] **Step 3:** Gate green. Commit: `feat(frontend): add SubjectPicker for polymorphic subject fields`

---

### Task 3: Companies + Tags pages (simple CRUD)

**Files:** `frontend/src/routes/companies.tsx`, `frontend/src/routes/tags.tsx`, register both routes, tests for both

- [ ] **Step 1: Companies page** — copy `contexts.tsx`; fields Name (req), Slug (req), Domain, Notes; columns Name, Slug, Domain, Actions; hooks from `src/features/companies/api.ts` (`useCompanies/useCreateCompany/useUpdateCompany/useDeleteCompany` — these exist). Export `CompaniesPage` + `companiesRoute` (`/companies`); register in `router.tsx`.
- [ ] **Step 2: Tags page** — copy `contexts.tsx`; fields Name (req), Kind; columns Name, Kind, Actions; hooks `useTags/useCreateTag/useUpdateTag/useDeleteTag`. Export `TagsPage` + `tagsRoute` (`/tags`); register.
- [ ] **Step 3: Tests** `companies.test.tsx` + `tags.test.tsx` (mirror contexts.test.tsx): stub `/auth/me`→200 and the list→`[]`; type name (+slug for companies), click Add, assert the POST.
- [ ] **Step 4:** Gate green. Commit: `feat(frontend): add companies and tags CRUD pages`

---

### Task 4: Relationships + Observations pages

**Files:** `frontend/src/routes/relationships.tsx`, `frontend/src/routes/observations.tsx`, register routes, tests

- [ ] **Step 1: Relationships page** — form: From person (`Select`, req, from `usePeople()` `{value:id,label:name}`), To person (`Select`, req, same), Type (`Input`, default "knows"), Context (`Select` optional, `useContexts()`), Since (Input type date), Notes (Input). Omit empty optional fields. Columns: From (resolve person name), To (resolve person name), Type, Actions. Hooks `useRelationships/useCreateRelationship/useUpdateRelationship/useDeleteRelationship`. Export `relationshipsRoute` (`/relationships`); register.
- [ ] **Step 2: Observations page** — form: Subject (`SubjectPicker` for `subject_type`+`subject_id`, both required), Kind (`Select`: observation/preference/fact/open_loop/decision/key_point/open_question, default observation), Body (`Input`, req), Date (Input type date), Source (Input). Build `ObservationCreate` (omit empty date/source). Columns: Subject (show `subject_type` + a short id, or just `subject_type`), Kind, Body (truncate), Actions. Hooks `useObservations/...`. Export `observationsRoute` (`/observations`); register.
- [ ] **Step 3: Tests** `relationships.test.tsx` (stub `/auth/me`→200, `/people`→two people, `/contexts`→`[]`, `/relationships`→`[]`; select from/to person, click Add, assert POST with both ids) + `observations.test.tsx` (stub `/auth/me`→200, the subject lists, `/observations`→`[]`; pick subject_type=person + a person id + type a body, click Add, assert POST with subject_type/subject_id/body).
- [ ] **Step 4:** Gate green. Commit: `feat(frontend): add relationships and observations pages`

---

### Task 5: Entity-Tags + Entity-Links pages (immutable: create/list/delete)

**Files:** `frontend/src/routes/entity-tags.tsx`, `frontend/src/routes/entity-links.tsx`, register routes, tests

- [ ] **Step 1: Entity-Tags page** — form: Tag (`Select`, req, from `useTags()` `{value:id,label:name}`), Subject (`SubjectPicker`). On Add, POST `{tag_id, subject_type, subject_id}` via `useCreateEntityTag`. NO edit (immutable); Delete via `ConfirmButton` + `useDeleteEntityTag`. Columns: Tag (resolve name from `useTags()`), Subject type, Subject id (short), Actions (Delete only). Export `entityTagsRoute` (`/entity-tags`); register.
- [ ] **Step 2: Entity-Links page** — form: From (`SubjectPicker` for from_type/from_id), To (`SubjectPicker` for to_type/to_id), Kind (`Input`, default "related"). POST `{from_type, from_id, to_type, to_id, kind}` via `useCreateEntityLink`. NO edit; Delete via `useDeleteEntityLink`. Columns: From (type+id), To (type+id), Kind, Actions (Delete only). Export `entityLinksRoute` (`/entity-links`); register.
- [ ] **Step 3: Tests** `entity-tags.test.tsx` (stub `/auth/me`→200, `/tags`→one tag, subject lists, `/entity-tags`→`[]`; select tag + subject person, click Add, assert POST `{tag_id, subject_type:"person", subject_id}`) + `entity-links.test.tsx` (stub lists; pick from person + to context + kind, click Add, assert POST with from_type/from_id/to_type/to_id).
- [ ] **Step 4:** Gate green. Commit: `feat(frontend): add entity-tags and entity-links pages`

---

### Task 6: Navigation + verification

**Files:** `frontend/src/components/AppShell.tsx`

- [ ] **Step 1:** Update `NAV` to include the new pages. New order:
```ts
const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/contexts", label: "Contexts" },
  { to: "/projects", label: "Projects" },
  { to: "/people", label: "People" },
  { to: "/companies", label: "Companies" },
  { to: "/tasks", label: "Tasks" },
  { to: "/relationships", label: "Relationships" },
  { to: "/observations", label: "Observations" },
  { to: "/tags", label: "Tags" },
  { to: "/entity-tags", label: "Entity Tags" },
  { to: "/entity-links", label: "Entity Links" },
  { to: "/journal", label: "Journal" },
  { to: "/habits", label: "Habits" },
  { to: "/meetings", label: "Meetings" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/inbox", label: "Inbox" },
  { to: "/telos", label: "TELOS" },
  { to: "/activity", label: "Activity" },
];
```
- [ ] **Step 2:** Full gate: `npm run test -- --run && npm run lint && npm run typecheck && npm run build` — all green.
- [ ] **Step 3:** Commit: `feat(frontend): link all entity pages in the sidebar nav`

---

## Self-Review

**Spec coverage:** CRUD pages for all 10 entities now exist (contexts/projects/people/tasks from before; companies/tags/relationships/observations/entity-tags/entity-links here). Polymorphic subjects handled by `SubjectPicker`. Immutable entity-tags/entity-links use create/list/delete only. Undo for all via the existing Activity page. *Deferred:* per-entity detail views, tag-from-entity-page UX, FK validation messages.

**Placeholder scan:** Types, api module specs, and the `SubjectPicker` are given in full; pages reuse the proven `contexts/people/tasks` templates with explicit field/column/hook specs.

**Type/name consistency:** hooks `useTags/useRelationships/useObservations/useEntityTags/useEntityLinks` (+ create/update/delete); routes `companiesRoute/tagsRoute/relationshipsRoute/observationsRoute/entityTagsRoute/entityLinksRoute`; `SubjectPicker`/`SUBJECT_TYPES`. Client paths use hyphens (`/entity-tags`, `/entity-links`) matching the backend router prefixes.

**Known fragility:** `SubjectPicker` calls all five list hooks unconditionally (loads all lists) — fine at single-user scale; keeps hook order stable. Immutable pages must omit an Edit action. Relationship/EntityLink unique constraints mean a duplicate raises a backend error (surfaced as a failed mutation) — acceptable; a toast on error is a future nicety.
