# Frontend Shell (P0.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A TanStack-based SPA that talks to the P0.1 FastAPI backend: a login page that authenticates against `/auth/login`, a protected empty dashboard inside an app shell (sidebar nav, capture button + chat panel placeholders), with lint/typecheck/tests green and an end-to-end login verified.

**Architecture:** Vite + React + TypeScript SPA in `frontend/`. TanStack Router (code-based routes, no file codegen) for routing, TanStack Query for server state (the auth/session is just a `me` query). A thin `fetch` API client; Vite dev server proxies `/auth` and `/health` to `http://localhost:8000`, so the browser is same-origin and no CORS is needed. Tailwind v4 (`@tailwindcss/vite`) for styling; small hand-rolled UI primitives (no shadcn CLI, to avoid toolchain fragility). Vitest + Testing Library for tests.

**Tech Stack:** Vite, React 19, TypeScript, @tanstack/react-router, @tanstack/react-query, Tailwind CSS v4, Vitest, @testing-library/react, ESLint (flat config from the Vite template).

**Scope note:** Second slice of spec phase **P0**. Only `/login` and `/` (dashboard) are real. Other domain nav items route to a shared "Coming soon" placeholder. The chat panel and the ⌘K capture button are non-functional placeholders (wired in P5). Caddy/TLS, Neo4j, and the worker are a separate infra plan (P0.3). All paths are relative to repo root `~/projects/mission-control/`. Run frontend commands from `frontend/`.

**Version drift:** Where a pinned version doesn't exist or an API changed, adapt to the current stable release and note it (same policy as the backend plan). Prefer the current major versions of the libraries named above.

---

### Task 1: Scaffold the Vite React-TS app

**Files:** creates the `frontend/` project.

- [ ] **Step 1: Scaffold (from repo root)**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Smoke-check the toolchain**

Run (from `frontend/`): `npm run build`
Expected: a clean production build into `frontend/dist`.

- [ ] **Step 3: Remove template cruft**

Delete `src/assets/react.svg`, `public/vite.svg`, and the demo styles in `src/App.css` (leave the file empty or delete it and remove its import). Replace `src/App.tsx` body with a trivial `export default function App() { return null }` for now (it will be replaced in Task 5). Ensure `npm run build` still passes.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "chore(frontend): scaffold vite react-ts app"
```

---

### Task 2: Tailwind v4

**Files:** `frontend/vite.config.ts`, `frontend/src/index.css`, `frontend/package.json`

- [ ] **Step 1: Install Tailwind v4**

Run (from `frontend/`): `npm install tailwindcss @tailwindcss/vite`

- [ ] **Step 2: Wire the Vite plugin**

Edit `frontend/vite.config.ts` to add the Tailwind plugin alongside React:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

- [ ] **Step 3: Replace `frontend/src/index.css` with**

```css
@import "tailwindcss";

:root {
  color-scheme: light dark;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
}
```

Ensure `src/main.tsx` imports `./index.css` (the template already does).

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: build passes with Tailwind processing the CSS.

- [ ] **Step 5: Commit**

```bash
git add frontend/vite.config.ts frontend/src/index.css frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add tailwind v4"
```

---

### Task 3: Providers — TanStack Query + Router skeleton

**Files:**
- Install: `@tanstack/react-router @tanstack/react-query`
- Create: `frontend/src/router.tsx`
- Create: `frontend/src/routes/root.tsx`
- Create: `frontend/src/routes/index.tsx` (dashboard placeholder for now)
- Create: `frontend/src/routes/login.tsx` (placeholder for now)
- Create: `frontend/src/routes/placeholder.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Install**

Run (from `frontend/`): `npm install @tanstack/react-router @tanstack/react-query`

- [ ] **Step 2: Create `frontend/src/routes/root.tsx`**

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const rootRoute = createRootRoute({
  component: () => <Outlet />,
});
```

- [ ] **Step 3: Create `frontend/src/routes/index.tsx` (temporary placeholder; replaced in Task 6)**

```tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <div>dashboard</div>,
});
```

- [ ] **Step 4: Create `frontend/src/routes/login.tsx` (temporary placeholder; replaced in Task 6)**

```tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: () => <div>login</div>,
});
```

- [ ] **Step 5: Create `frontend/src/routes/placeholder.tsx`**

```tsx
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";

function ComingSoon() {
  return <div className="p-8 text-gray-500">Coming soon</div>;
}

export const placeholderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$section",
  component: ComingSoon,
});
```

- [ ] **Step 6: Create `frontend/src/router.tsx`**

```tsx
import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/root";
import { indexRoute } from "./routes/index";
import { loginRoute } from "./routes/login";
import { placeholderRoute } from "./routes/placeholder";

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, placeholderRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 7: Replace `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

Delete `frontend/src/App.tsx` and `frontend/src/App.css` if still present (no longer used).

- [ ] **Step 8: Verify**

Run: `npm run build`
Expected: build passes; type-checks the router registration.

- [ ] **Step 9: Commit**

```bash
git add frontend/src frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): add query + router providers and route skeleton"
```

---

### Task 4: API client + dev proxy

**Files:**
- Create: `frontend/src/lib/api.ts`
- Modify: `frontend/vite.config.ts`
- Test: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: Add the dev proxy to `frontend/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
```

- [ ] **Step 2: Write the failing test `frontend/src/lib/api.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("apiFetch", () => {
  it("returns parsed json on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const data = await apiFetch<{ ok: boolean }>("/auth/me");
    expect(data).toEqual({ ok: true });
  });

  it("throws ApiError with status on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    await expect(apiFetch("/auth/me")).rejects.toMatchObject({ status: 401 });
    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test -- --run src/lib/api.test.ts` (after Task 8 sets up vitest; if vitest is not yet configured, this test will be exercised in Task 8 — create the file now and proceed). For now create the implementation so the file imports resolve.

- [ ] **Step 4: Create `frontend/src/lib/api.ts`**

```ts
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts frontend/vite.config.ts
git commit -m "feat(frontend): add api client and dev proxy"
```

---

### Task 5: Auth hooks

**Files:**
- Create: `frontend/src/lib/auth.ts`
- Test: `frontend/src/lib/auth.test.tsx`

- [ ] **Step 1: Write the failing test `frontend/src/lib/auth.test.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useMe } from "./auth";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

it("useMe returns the current user on 200", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ id: "1", email: "g@x.com" }), { status: 200 })),
  );
  const { result } = renderHook(() => useMe(), { wrapper });
  await waitFor(() => expect(result.current.data?.email).toBe("g@x.com"));
});

it("useMe is null-ish (error) when unauthenticated", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("unauth", { status: 401 })),
  );
  const { result } = renderHook(() => useMe(), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
});
```

- [ ] **Step 2: Create `frontend/src/lib/auth.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/auth/me"),
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      apiFetch<User>("/auth/login", { method: "POST", body: JSON.stringify(creds) }),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => qc.setQueryData(["me"], null),
  });
}
```

- [ ] **Step 3: Run the test (after Task 8 vitest setup) — expected PASS.** Create now; verified green in Task 8.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/auth.ts frontend/src/lib/auth.test.tsx
git commit -m "feat(frontend): add auth query/mutation hooks"
```

---

### Task 6: Login page, dashboard, route guard, app shell

**Files:**
- Create: `frontend/src/components/ui.tsx` (Button, Input, Card, Field)
- Create: `frontend/src/components/AppShell.tsx`
- Create: `frontend/src/components/RequireAuth.tsx`
- Replace: `frontend/src/routes/login.tsx`
- Replace: `frontend/src/routes/index.tsx`
- Test: `frontend/src/routes/login.test.tsx`

- [ ] **Step 1: Create `frontend/src/components/ui.tsx`**

```tsx
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      className={`rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 ${className}`}
      {...rest}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none ${className}`}
      {...rest}
    />
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/RequireAuth.tsx`**

```tsx
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMe } from "../lib/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isLoading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (me.isError) return <Navigate to="/login" />;
  return <>{children}</>;
}
```

- [ ] **Step 3: Create `frontend/src/components/AppShell.tsx`**

```tsx
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useLogout, useMe } from "../lib/auth";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/people", label: "People" },
  { to: "/tasks", label: "Tasks" },
  { to: "/journal", label: "Journal" },
  { to: "/habits", label: "Habits" },
  { to: "/meetings", label: "Meetings" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/inbox", label: "Inbox" },
  { to: "/telos", label: "TELOS" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        <div className="mb-6 text-lg font-semibold">mission-control</div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="block rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 [&.active]:bg-gray-200 [&.active]:font-medium"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <button
            disabled
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-400"
            title="Coming soon"
          >
            ⌘K Capture
          </button>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>{me.data?.email}</span>
            <button className="text-gray-500 hover:text-gray-900" onClick={() => logout.mutate()}>
              Log out
            </button>
          </div>
        </header>
        <div className="flex flex-1">
          <main className="flex-1 overflow-auto">{children}</main>
          <aside className="hidden w-72 shrink-0 border-l border-gray-200 p-4 text-sm text-gray-400 lg:block">
            <div className="font-medium text-gray-600">Aya</div>
            <p className="mt-2">Chat coming soon.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace `frontend/src/routes/login.tsx`**

```tsx
import { createRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button, Card, Field, Input } from "../components/ui";
import { useLogin } from "../lib/auth";
import { rootRoute } from "./root";

function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate({ to: "/" }) });
  }

  return (
    <div className="flex h-full items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm">
        <Card>
          <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            {login.isError && <p className="text-sm text-red-600">Invalid credentials</p>}
            <Button type="submit" disabled={login.isPending} className="w-full">
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
```

- [ ] **Step 5: Replace `frontend/src/routes/index.tsx`**

```tsx
import { createRoute } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { rootRoute } from "./root";

function Dashboard() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="p-8">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-gray-500">Welcome. Your life, in one place — content coming soon.</p>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});
```

- [ ] **Step 6: Wrap the placeholder route in the shell too**

Edit `frontend/src/routes/placeholder.tsx` so `ComingSoon` renders inside `RequireAuth` + `AppShell` (same pattern as Dashboard), showing the `$section` name.

- [ ] **Step 7: Write the test `frontend/src/routes/login.test.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { loginRoute } from "./login";

afterEach(() => vi.restoreAllMocks());

function renderLogin() {
  const root = createRootRoute();
  const login = createRoute({ getParentRoute: () => root, path: "/login", component: loginRoute.options.component });
  const index = createRoute({ getParentRoute: () => root, path: "/", component: () => <div>dashboard-home</div> });
  const router = createRouter({ routeTree: root.addChildren([login, index]), history: undefined });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router.navigate({ to: "/login" });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("submits credentials and calls the login endpoint", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1", email: "g@x.com" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  renderLogin();
  await screen.findByText("Sign in");
  await userEvent.type(screen.getByLabelText("Email"), "g@x.com");
  await userEvent.type(screen.getByLabelText("Password"), "secret");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() => {
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("/auth/login"))).toBe(true);
  });
});
```

> If the router test harness proves fragile (router version API differences), simplify: render `<LoginPage>` directly by exporting the component and asserting the form submit triggers a `/auth/login` fetch, dropping the router wrapper. Keep the behavioral assertion (submit → POST /auth/login).

- [ ] **Step 8: Verify build + commit**

Run: `npm run build`
Expected: passes. Then:

```bash
git add frontend/src
git commit -m "feat(frontend): add login, dashboard, route guard, and app shell"
```

---

### Task 7: ESLint, typecheck, vitest config, scripts

**Files:** `frontend/package.json`, `frontend/vitest.config.ts` (or `vite.config.ts` test block), `frontend/src/test-setup.ts`

- [ ] **Step 1: Install test deps**

Run (from `frontend/`): `npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`

- [ ] **Step 2: Create `frontend/src/test-setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Configure vitest** (add a `test` block to `vite.config.ts`, using `defineConfig` from `vitest/config`, OR create `vitest.config.ts`). Use:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

(If you keep a single `vite.config.ts`, merge this so both build and test use it. Remove a duplicate `vitest.config.ts` if present.)

- [ ] **Step 4: Add scripts to `frontend/package.json`**

Ensure `scripts` includes:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "typecheck": "tsc -b --noEmit",
  "test": "vitest"
}
```

- [ ] **Step 5: Run the full gate**

Run (from `frontend/`):

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Expected: lint clean, typecheck clean, all vitest tests pass (api, auth, login), build passes. Fix any findings (lint rules, types) with minimal changes. If an ESLint rule from the template is noisy for test files, scope a sensible override rather than disabling broadly.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "chore(frontend): configure vitest, lint, typecheck, scripts"
```

---

### Task 8: End-to-end login smoke test (controller-run)

This task is run by the controller, not a subagent, because it coordinates both servers.

- [ ] **Step 1: Ensure dev DB is migrated and a user is seeded**

```bash
cd backend
uv run alembic upgrade head
uv run python -m app.cli seed-user --email g@example.com --password changeme --name G
```

- [ ] **Step 2: Start the backend (background)**

```bash
cd backend && uv run uvicorn app.main:app --port 8000
```
(run in background)

- [ ] **Step 3: Start the frontend dev server (background)**

```bash
cd frontend && npm run dev -- --port 5173
```
(run in background)

- [ ] **Step 4: Verify the proxy + auth flow through the frontend origin**

```bash
# unauthenticated → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/auth/me
# login (stores cookie) → 200
curl -s -c /tmp/mc_cookies.txt -X POST http://localhost:5173/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"g@example.com","password":"changeme"}' -w "\n%{http_code}\n"
# me with cookie → 200 and the user json
curl -s -b /tmp/mc_cookies.txt http://localhost:5173/auth/me -w "\n%{http_code}\n"
```
Expected: first call `401`; login `200` with the user JSON; authenticated `/auth/me` `200` with `g@example.com`.

- [ ] **Step 5: Stop the background servers.** Record the smoke-test output. No commit (verification only).

---

### Task 9: Extend CI with a frontend job

**Files:** `.github/workflows/ci.yml`

- [ ] **Step 1: Add a `frontend` job** to `.github/workflows/ci.yml` (sibling to `backend`):

```yaml
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --run
      - run: npm run build
```

- [ ] **Step 2: Validate YAML**

Run (from repo root): `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`

- [ ] **Step 3: Commit (do not push)**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add frontend lint, typecheck, test, build job"
```

---

## Self-Review

**Spec coverage (P0 frontend portions):**
- TanStack client → Tasks 1, 3 ✓
- Login + session auth against backend → Tasks 4, 5, 6 ✓
- Protected empty dashboard → Task 6 ✓
- App shell: nav, ⌘K capture placeholder, chat panel placeholder → Task 6 ✓
- Tests + lint + typecheck + CI → Tasks 7, 9 ✓
- End-to-end login verified → Task 8 ✓
- *Out of scope (later plans):* Caddy/TLS, real domain pages, real capture/chat (P5), Neo4j/worker (P0.3/P4).

**Placeholder scan:** Tasks contain concrete code for the fragile pieces (vite/tailwind/router/query/api/auth/login/tests). Presentational nav labels are intentionally placeholder pages. No "TODO/TBD" left as implementation gaps.

**Type/name consistency:** `apiFetch`, `ApiError`, `useMe`, `useLogin`, `useLogout`, `User`, `RequireAuth`, `AppShell`, `rootRoute`, `indexRoute`, `loginRoute`, `placeholderRoute`, `router` are used consistently across tasks.

**Known fragility flagged for the executor:** (1) TanStack Router's code-based API can shift between minor versions — if `createRouter`/route options differ, adapt and keep the route tree shape. (2) The login route test uses a router harness; the fallback (render the component directly) is documented in Task 6 Step 7. (3) Tailwind v4 needs the `@tailwindcss/vite` plugin and `@import "tailwindcss";` — no `tailwind.config.js` required.
