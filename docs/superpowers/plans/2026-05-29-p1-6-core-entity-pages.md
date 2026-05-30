# P1.6 — Projects, People, Tasks CRUD pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** CRUD pages for the daily-use entities — **Projects, People, Tasks** — reusing the Contexts page foundation, with FK dropdowns (context/company/project), enum selects (status/priority), and date inputs. Fix the sidebar nav so all built entities are reachable.

**Architecture:** Same as P1.5 — `resource()` + `makeResourceHooks` per entity, pages = form + `DataTable` + edit/delete, wrapped in `RequireAuth`+`AppShell`. FK `<Select>` options come from the related entity's `useList` hook. Undo continues to work via the existing Activity page (no per-page undo needed).

**Reference template (in repo, working):** `src/routes/contexts.tsx`, `src/features/contexts/api.ts`, `src/routes/contexts.test.tsx`, `src/lib/{resource,hooks,types}.ts`, `src/components/{DataTable,ConfirmButton,ui}.tsx`. Build APIs through `/api` (handled centrally by `apiFetch`).

**Scope note:** Branch `feat/p1-frontend-crud`; run from `frontend/`. Full gate (`npm run test -- --run && npm run lint && npm run typecheck && npm run build`) at the end of EACH task. Companies get a list hook only (for the Person form dropdown) — no Companies page in this slice.

---

### Task 1: Select primitive + types + api modules

**Files:** `frontend/src/components/ui.tsx` (add `Select`), `frontend/src/lib/types.ts` (add types), `frontend/src/features/{projects,people,tasks,companies}/api.ts`

- [ ] **Step 1: Add `Select` to `src/components/ui.tsx`** (keep existing exports):

```tsx
export interface Option {
  value: string;
  label: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
}) {
  return (
    <select
      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Add types to `src/lib/types.ts`** (append; keep existing Context/AuditEntry):

```ts
export interface Project {
  id: string;
  context_id: string;
  slug: string;
  title: string;
  status: string;
  purpose: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProjectCreate {
  context_id: string;
  slug: string;
  title: string;
  status?: string;
  purpose?: string | null;
  body?: string | null;
}
export type ProjectUpdate = Partial<ProjectCreate>;

export interface Company {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  slug: string;
  name: string;
  role: string | null;
  company_id: string | null;
  email: string | null;
  linkedin: string | null;
  first_met: string | null;
  primary_context_id: string | null;
  summary: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface PersonCreate {
  slug: string;
  name: string;
  role?: string | null;
  company_id?: string | null;
  email?: string | null;
  linkedin?: string | null;
  first_met?: string | null;
  primary_context_id?: string | null;
  summary?: string | null;
}
export type PersonUpdate = Partial<PersonCreate>;

export interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due: string | null;
  scheduled: string | null;
  context_id: string | null;
  project_id: string | null;
  outcome: string | null;
  body: string | null;
  source: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface TaskCreate {
  title: string;
  status?: string;
  priority?: string;
  due?: string | null;
  scheduled?: string | null;
  context_id?: string | null;
  project_id?: string | null;
  outcome?: string | null;
  body?: string | null;
  source?: string | null;
}
export type TaskUpdate = Partial<TaskCreate>;
```

- [ ] **Step 3: API modules** — mirror `src/features/contexts/api.ts` for each:
  - `src/features/projects/api.ts` → `useProjects`, `useCreateProject`, `useUpdateProject`, `useDeleteProject` (resource `/projects`, key `"projects"`, types `Project/ProjectCreate/ProjectUpdate`).
  - `src/features/people/api.ts` → `usePeople`, `useCreatePerson`, `useUpdatePerson`, `useDeletePerson` (resource `/people`, key `"people"`).
  - `src/features/tasks/api.ts` → `useTasks`, `useCreateTask`, `useUpdateTask`, `useDeleteTask` (resource `/tasks`, key `"tasks"`).
  - `src/features/companies/api.ts` → `useCompanies` only (resource `/companies`, key `"companies"`, type `Company` — for the Person form dropdown).

- [ ] **Step 4:** Gate green. Commit: `feat(frontend): add Select primitive, entity types, and resource hooks for projects/people/tasks`

---

### Task 2: Projects CRUD page

**Files:** `frontend/src/routes/projects.tsx`, register in `frontend/src/router.tsx`, test `frontend/src/routes/projects.test.tsx`

- [ ] **Step 1:** Build `ProjectsPage` (export it + `projectsRoute`, path `/projects`) by copying `contexts.tsx` and adapting:
  - Form fields: **Context** (`Select`, required, options from `useContexts()` mapped `{value:id, label:name}`), **Title** (`Input`), **Slug** (`Input`), **Status** (`Select` options: active/on_hold/complete/archived, default `active`), **Purpose** (`Input`), **Body** (`Input` or textarea — `Input` is fine).
  - On submit, build the `ProjectCreate` payload (`context_id`, `slug`, `title`, `status`, `purpose`, `body`) and call `useCreateProject`; Edit loads a row and switches to `useUpdateProject`; Delete via `ConfirmButton` + `useDeleteProject`.
  - `DataTable` columns: Title, Slug, Context (look up the context name from `useContexts()` by `row.context_id`; fall back to the id), Status, Actions.
  - Wrap in `RequireAuth`+`AppShell`.
- [ ] **Step 2:** Register `projectsRoute` in `src/router.tsx` (before `placeholderRoute`).
- [ ] **Step 3:** Test `src/routes/projects.test.tsx`: memory router + query; stub `fetch` so `/auth/me`→200, `/contexts`→`[{id:"c1",name:"Upsun",...}]`, `/projects`→`[]`; select the context, type title + slug, click Add, assert a POST to `/projects` fired with `context_id:"c1"` and the entered title/slug. (Stub by branching on URL + method.)
- [ ] **Step 4:** Gate green. Commit: `feat(frontend): add projects CRUD page`

---

### Task 3: People CRUD page

**Files:** `frontend/src/routes/people.tsx`, register route, test `frontend/src/routes/people.test.tsx`

- [ ] **Step 1:** Build `PeoplePage` (export it + `peopleRoute`, path `/people`) adapting the template:
  - Form fields: **Name** (`Input`, required), **Slug** (`Input`, required), **Role** (`Input`), **Company** (`Select`, optional with placeholder "— none —", options from `useCompanies()` `{value:id,label:name}`), **Primary context** (`Select`, optional placeholder, from `useContexts()`), **Email** (`Input` type email), **First met** (`Input` type date), **Summary** (`Input`).
  - Build `PersonCreate` (omit empty-string optional fields → send `null` or omit; for FK selects, empty string means omit). Call `useCreatePerson` / `useUpdatePerson` / `useDeletePerson`.
  - `DataTable` columns: Name, Slug, Role, Company (look up name via `useCompanies()`), Actions.
- [ ] **Step 2:** Register `peopleRoute` in `src/router.tsx`.
- [ ] **Step 3:** Test `src/routes/people.test.tsx`: stub `/auth/me`→200, `/companies`→`[]`, `/contexts`→`[]`, `/people`→`[]`; type name + slug, click Add, assert POST to `/people` with the name/slug. (Empty optional FK selects must NOT send invalid ids — assert the payload has no `company_id` or sends it as null/omitted.)
- [ ] **Step 4:** Gate green. Commit: `feat(frontend): add people CRUD page`

---

### Task 4: Tasks CRUD page

**Files:** `frontend/src/routes/tasks.tsx`, register route, test `frontend/src/routes/tasks.test.tsx`

- [ ] **Step 1:** Build `TasksPage` (export it + `tasksRoute`, path `/tasks`) adapting the template:
  - Form fields: **Title** (`Input`, required), **Status** (`Select` options open/in_progress/done/archived, default `open`), **Priority** (`Select` low/normal/high, default `normal`), **Due** (`Input` type date), **Scheduled** (`Input` type date), **Context** (`Select` optional placeholder, from `useContexts()`), **Project** (`Select` optional placeholder, from `useProjects()` `{value:id,label:title}`), **Outcome** (`Input`).
  - Build `TaskCreate` (omit empty optional fields). Call create/update/delete hooks.
  - `DataTable` columns: Title, Status, Priority, Due, Context (name via `useContexts()`), Actions.
- [ ] **Step 2:** Register `tasksRoute` in `src/router.tsx`.
- [ ] **Step 3:** Test `src/routes/tasks.test.tsx`: stub `/auth/me`→200, `/contexts`→`[]`, `/projects`→`[]`, `/tasks`→`[]`; type a title, click Add, assert POST to `/tasks` with the title and default status `open`/priority `normal` (only if your form sends them; otherwise assert title present). Also assert empty optional date/FK fields are not sent as invalid values.
- [ ] **Step 4:** Gate green. Commit: `feat(frontend): add tasks CRUD page`

---

### Task 5: Navigation + verification

**Files:** `frontend/src/components/AppShell.tsx`

- [ ] **Step 1:** Update the `NAV` array so the built entities are reachable. New order:
```ts
const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/contexts", label: "Contexts" },
  { to: "/projects", label: "Projects" },
  { to: "/people", label: "People" },
  { to: "/tasks", label: "Tasks" },
  { to: "/journal", label: "Journal" },
  { to: "/habits", label: "Habits" },
  { to: "/meetings", label: "Meetings" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/inbox", label: "Inbox" },
  { to: "/telos", label: "TELOS" },
  { to: "/activity", label: "Activity" },
];
```
(Journal/Habits/Meetings/Knowledge/Inbox/TELOS still resolve to the `/$section` "Coming soon" placeholder — that's expected.)

- [ ] **Step 2:** Full gate: `npm run test -- --run && npm run lint && npm run typecheck && npm run build` — all green.
- [ ] **Step 3:** Commit: `feat(frontend): link Contexts/Projects/People/Tasks in the sidebar nav`

---

## Self-Review

**Spec coverage:** CRUD pages for projects/people/tasks with FK dropdowns (context/company/project), enum selects (status/priority), and date inputs ✓; nav wired ✓; undo via existing Activity page ✓ (works for these entities automatically — they're audit-logged and registered). *Deferred:* Companies/Relationships/Observations/Tags/links pages; FK validation UX; richer detail views.

**Placeholder scan:** `Select` primitive, types, and api modules are given in full. The three pages have explicit field/column/hook specs and copy the working `contexts.tsx` structure — concrete, not placeholder.

**Type/name consistency:** `useProjects/useCreateProject/...`, `usePeople/...`, `useTasks/...`, `useCompanies`, `useContexts`; routes `projectsRoute/peopleRoute/tasksRoute` registered; `Select`/`Option` from `ui.tsx`. Payloads match the backend create schemas (`ProjectCreate` requires `context_id`; Person/Task FKs optional — omit when the select is empty rather than sending `""`).

**Known fragility:** Empty optional `<Select>` value is `""`; the page MUST omit such fields from the payload (or send `null`) — sending `""` as a uuid FK would 422/500. Each page test asserts this. FK dropdowns depend on the related list being loaded; an empty list just yields a select with only the placeholder (fine).
