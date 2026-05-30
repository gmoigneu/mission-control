# P1.5 — Frontend CRUD foundation + Contexts + Activity/Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the backend entities usable in the UI. Build reusable CRUD infrastructure (typed resource client + generic TanStack Query hooks), a full **Contexts** CRUD page (list/create/edit/delete), and an **Activity** page that lists recent audit entries with one-click **Undo** (calls the revert API). This delivers P1's "manage … in the UI and undo any change" for the first entity; later slices replicate the page to the other entities.

**Architecture:** A `resource(basePath)` factory wraps `apiFetch` for list/get/create/update/remove. A `makeResourceHooks(key, resource)` factory returns `useList/useCreate/useUpdate/useRemove` (TanStack Query, invalidating the list on mutation). Each entity gets a thin `features/<entity>/api.ts`. Pages live as TanStack Router routes (explicit paths take precedence over the existing `/$section` placeholder). Undo is centralised in an Activity page that reads `/audit` and posts `/audit/{id}/revert`.

**Tech Stack:** React, TanStack Router/Query, Tailwind v4, Vitest + Testing Library. (Forms are simple controlled React state + the existing `ui.tsx` primitives — no extra form lib yet.)

**Scope note:** Branch `feat/p1-frontend-crud`; run from `frontend/`. Only Contexts gets a CRUD page here; the Activity page works for ALL entity types (it reverts by audit id). Run `npm run test -- --run && npm run lint && npm run typecheck && npm run build` at the end of EACH task. Backend must be reachable at :8000 for the manual smoke (Task 6); unit tests mock `fetch`.

---

### Task 1: Resource client + entity types

**Files:** `frontend/src/lib/resource.ts`, `frontend/src/lib/types.ts`, test `frontend/src/lib/resource.test.ts`

- [ ] **Step 1: `src/lib/resource.ts`**

```ts
import { apiFetch } from "./api";

export interface Resource<TOut, TCreate, TUpdate> {
  list: (query?: Record<string, string>) => Promise<TOut[]>;
  get: (id: string) => Promise<TOut>;
  create: (data: TCreate) => Promise<TOut>;
  update: (id: string, data: TUpdate) => Promise<TOut>;
  remove: (id: string) => Promise<void>;
}

export function resource<TOut, TCreate, TUpdate>(
  basePath: string,
): Resource<TOut, TCreate, TUpdate> {
  return {
    list: (query) => {
      const qs =
        query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : "";
      return apiFetch<TOut[]>(`${basePath}${qs}`);
    },
    get: (id) => apiFetch<TOut>(`${basePath}/${id}`),
    create: (data) => apiFetch<TOut>(basePath, { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) =>
      apiFetch<TOut>(`${basePath}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id) => apiFetch<void>(`${basePath}/${id}`, { method: "DELETE" }),
  };
}
```

- [ ] **Step 2: `src/lib/types.ts`**

```ts
export interface Context {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}
export interface ContextCreate {
  slug: string;
  name: string;
  category?: string;
  description?: string | null;
  status?: string;
}
export type ContextUpdate = Partial<ContextCreate>;

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  surface: string;
  reverted: boolean;
  created_at: string;
}
```

- [ ] **Step 3: Test `src/lib/resource.test.ts`** — stub `fetch`, assert `list()` calls the base path (and appends a query string when given a query), and `create()` POSTs JSON.

```ts
import { afterEach, expect, it, vi } from "vitest";
import { resource } from "./resource";

afterEach(() => vi.restoreAllMocks());

it("list hits the base path and create POSTs", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([String(url), init]);
      return new Response(JSON.stringify(init?.method === "POST" ? { id: "1" } : []), { status: 200 });
    }),
  );
  const r = resource<{ id: string }, { name: string }, object>("/contexts");
  await r.list();
  await r.list({ status: "active" });
  await r.create({ name: "x" });
  expect(calls[0][0]).toContain("/contexts");
  expect(calls[1][0]).toContain("status=active");
  expect(calls[2][1]?.method).toBe("POST");
});
```

- [ ] **Step 4:** `npm run test -- --run src/lib/resource.test.ts` (pass), then `npm run lint && npm run typecheck && npm run build`.
- [ ] **Step 5:** Commit: `git add src/lib/resource.ts src/lib/types.ts src/lib/resource.test.ts && git commit -m "feat(frontend): add resource client and entity types"`

---

### Task 2: Generic resource hooks

**Files:** `frontend/src/lib/hooks.ts`, test `frontend/src/lib/hooks.test.tsx`

- [ ] **Step 1: `src/lib/hooks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Resource } from "./resource";

export function makeResourceHooks<TOut extends { id: string }, TCreate, TUpdate>(
  key: string,
  res: Resource<TOut, TCreate, TUpdate>,
) {
  function useList(query?: Record<string, string>) {
    return useQuery({ queryKey: [key, query ?? {}], queryFn: () => res.list(query) });
  }
  function useCreate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (data: TCreate) => res.create(data),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  }
  function useUpdate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (args: { id: string; data: TUpdate }) => res.update(args.id, args.data),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  }
  function useRemove() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => res.remove(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
    });
  }
  return { useList, useCreate, useUpdate, useRemove };
}
```

- [ ] **Step 2: Test `src/lib/hooks.test.tsx`** — wrap in a `QueryClientProvider`, stub `fetch` to return a list, assert `useList().data` resolves; stub a POST and assert `useCreate().mutateAsync` resolves and triggers a refetch (fetch called again). Use `renderHook` + `waitFor` (mirror the existing `src/lib/auth.test.tsx` harness).

- [ ] **Step 3:** Gate green (`test`/`lint`/`typecheck`/`build`).
- [ ] **Step 4:** Commit: `feat(frontend): add generic resource query hooks`

---

### Task 3: Reusable DataTable + ConfirmButton

**Files:** `frontend/src/components/DataTable.tsx`, `frontend/src/components/ConfirmButton.tsx`

- [ ] **Step 1: `src/components/DataTable.tsx`** — a minimal generic table (no TanStack Table dependency needed yet; keep it simple):

```tsx
import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  empty = "Nothing yet.",
}: {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="p-4 text-sm text-gray-400">{empty}</p>;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-gray-500">
          {columns.map((c) => (
            <th key={c.header} className="px-3 py-2 font-medium">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
            {columns.map((c) => (
              <td key={c.header} className="px-3 py-2">
                {c.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: `src/components/ConfirmButton.tsx`** — a button that requires a second click (or `window.confirm`) before firing, for deletes:

```tsx
import { useState } from "react";

export function ConfirmButton({
  onConfirm,
  children = "Delete",
}: {
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={`text-xs ${armed ? "font-semibold text-red-600" : "text-gray-500 hover:text-red-600"}`}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Confirm?" : children}
    </button>
  );
}
```

- [ ] **Step 3:** Gate green. Commit: `feat(frontend): add DataTable and ConfirmButton components`

---

### Task 4: Contexts CRUD page

**Files:** `frontend/src/features/contexts/api.ts`, `frontend/src/routes/contexts.tsx`, register route in `frontend/src/router.tsx`, test `frontend/src/routes/contexts.test.tsx`

- [ ] **Step 1: `src/features/contexts/api.ts`**

```ts
import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Context, ContextCreate, ContextUpdate } from "../../lib/types";

export const contextsResource = resource<Context, ContextCreate, ContextUpdate>("/contexts");

export const {
  useList: useContexts,
  useCreate: useCreateContext,
  useUpdate: useUpdateContext,
  useRemove: useDeleteContext,
} = makeResourceHooks<Context, ContextCreate, ContextUpdate>("contexts", contextsResource);
```

- [ ] **Step 2: `src/routes/contexts.tsx`** — a route component wrapped in `RequireAuth` + `AppShell`, showing: an "Add context" form (controlled inputs for `slug`, `name`, `category`, `description`) that calls `useCreateContext`; a `DataTable` of contexts with an inline Edit (loads the row into the form, switches to update via `useUpdateContext`) and a `ConfirmButton` delete (`useDeleteContext`). Use the `ui.tsx` `Button`/`Input`/`Field`/`Card`. Keep the form state minimal. The route:

```tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";
// ... build ContextsPage with the hooks + DataTable + ConfirmButton ...
export const contextsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contexts",
  component: ContextsPage,
});
```

Requirements for `ContextsPage`:
- Lists contexts in a table with columns: Name, Slug, Category, Status, Actions.
- A form to add a context; on submit calls create then clears the form.
- Edit: clicking Edit fills the form and the submit button switches to "Save" (calls update with the row id); a Cancel resets to add mode.
- Delete: `ConfirmButton` calls `useDeleteContext().mutate(row.id)`.
- Show a small "Manage from the Activity page to undo changes." hint linking to `/activity`.
- Wrap content in `<RequireAuth><AppShell> … </AppShell></RequireAuth>` (import from `../components/...`).

- [ ] **Step 3: Register the route** in `src/router.tsx`: import `contextsRoute` and add it to `rootRoute.addChildren([...])` BEFORE `placeholderRoute` (explicit path beats the `/$section` param route anyway, but keep ordering tidy).

- [ ] **Step 4: Test `src/routes/contexts.test.tsx`** — render `ContextsPage` inside a memory router (mirror `login.test.tsx`/`RequireAuth.test.tsx`) + `QueryClientProvider`. Stub `fetch`: first GET `/auth/me`→user (so RequireAuth passes) and GET `/contexts`→`[]`; then typing into the name/slug inputs and clicking Add issues a POST to `/contexts`. Assert the POST fired with the entered values. (If wiring RequireAuth's `useMe` in the test is fiddly, export `ContextsPage` and test it directly within router+query context, stubbing `/auth/me`→200 so the guard passes.)

- [ ] **Step 5:** Gate green (`test`/`lint`/`typecheck`/`build`). Commit: `feat(frontend): add contexts CRUD page`

---

### Task 5: Activity page with Undo

**Files:** `frontend/src/features/audit/api.ts`, `frontend/src/routes/activity.tsx`, register route, add nav link in `frontend/src/components/AppShell.tsx`, test `frontend/src/routes/activity.test.tsx`

- [ ] **Step 1: `src/features/audit/api.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { AuditEntry } from "../../lib/types";

export function useAudit() {
  return useQuery({ queryKey: ["audit"], queryFn: () => apiFetch<AuditEntry[]>("/audit") });
}

export function useRevert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (auditId: string) =>
      apiFetch<AuditEntry>(`/audit/${auditId}/revert`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

(`qc.invalidateQueries()` with no key refetches every list, so the reverted change disappears from whichever entity table is open.)

- [ ] **Step 2: `src/routes/activity.tsx`** — `RequireAuth` + `AppShell` + a `DataTable` of audit entries (columns: When (`created_at`), Action, Entity (`entity_type`), Surface, Reverted, Undo). The Undo cell renders a button that calls `useRevert().mutate(row.id)`, disabled when `row.reverted` is true. Register `activityRoute` (path `/activity`) in `src/router.tsx`.

- [ ] **Step 3: Nav** — in `src/components/AppShell.tsx`, add `{ to: "/activity", label: "Activity" }` to the `NAV` array.

- [ ] **Step 4: Test `src/routes/activity.test.tsx`** — render the activity page in router+query context; stub `/auth/me`→200, `/audit`→`[{...one create entry, reverted:false}]`; assert the entry renders and clicking its Undo button POSTs to `/audit/<id>/revert`.

- [ ] **Step 5:** Gate green. Commit: `feat(frontend): add activity page with undo`

---

### Task 6: Manual end-to-end smoke (controller-run)

- [ ] **Step 1:** Ensure backend migrated + user seeded; start backend (`uvicorn app.main:app --port 8000`) and frontend (`npm run dev -- --port 5173`) in the background.
- [ ] **Step 2:** Verify via the proxy that the new flows work end-to-end with a real DB:
```bash
# login, capture cookie
curl -s -c /tmp/c.txt -X POST localhost:5173/auth/login -H 'Content-Type: application/json' -d '{"email":"g@example.com","password":"changeme"}' -o /dev/null -w "login %{http_code}\n"
# create a context
CID=$(curl -s -b /tmp/c.txt -X POST localhost:5173/contexts -H 'Content-Type: application/json' -d '{"slug":"smoke","name":"Smoke","category":"work"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "created $CID"
# it appears in the list
curl -s -b /tmp/c.txt localhost:5173/contexts -w "\n" | python3 -c "import sys,json;print('list count', len(json.load(sys.stdin)))"
# find its create audit id and revert it
AID=$(curl -s -b /tmp/c.txt localhost:5173/audit | python3 -c "import sys,json;rows=json.load(sys.stdin);print(next(r['id'] for r in rows if r['action']=='create' and r['entity_id']=='$CID'))")
curl -s -b /tmp/c.txt -X POST localhost:5173/audit/$AID/revert -o /dev/null -w "revert %{http_code}\n"
# context is gone
curl -s -b /tmp/c.txt localhost:5173/contexts/$CID -o /dev/null -w "after-undo get %{http_code}\n"  # expect 404
```
Expected: login 200, created id printed, list count ≥1, revert 200, after-undo get 404.
- [ ] **Step 3:** Stop the servers. Record output. No commit (verification only). Optionally use the agent-browser skill to click through the Contexts page + Activity Undo in a real browser.

---

## Self-Review

**Spec coverage (P1 "manage … in the UI and undo any change", SPEC §12):** reusable CRUD client + hooks ✓; Contexts list/create/edit/delete page ✓; Activity view listing audit entries with Undo (revert) ✓; nav wiring ✓. *Deferred to P1.6:* CRUD pages for projects/people/tasks/etc. (replicate the Contexts page using `makeResourceHooks` + `DataTable`), per-mutation toast-undo, richer forms (selects for FK fields).

**Placeholder scan:** Concrete code given for resource/hooks/DataTable/ConfirmButton/audit api; the two pages (`contexts.tsx`, `activity.tsx`) have explicit component requirements rather than full JSX (they are straightforward compositions of the given primitives) — acceptable, not a gap.

**Type/name consistency:** `resource()` / `makeResourceHooks()` / `useContexts`/`useCreateContext`/`useUpdateContext`/`useDeleteContext` / `useAudit`/`useRevert` / `DataTable`/`Column`/`ConfirmButton` are consistent across tasks. Routes `contextsRoute`/`activityRoute` registered in `router.tsx`; nav updated in `AppShell.tsx`.

**Known fragility:** Tests must stub `/auth/me`→200 so `RequireAuth` lets the page render. `useRevert` invalidates ALL queries (simple + correct for single-user). The Activity page reverts by audit id, so it works for every entity type, not just contexts.
