import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ActivityPage } from "./activity";

afterEach(() => vi.restoreAllMocks());

const AUDIT_ENTRY = {
  id: "a1",
  actor: "u1",
  action: "create",
  entity_type: "context",
  entity_id: "c1",
  before: null,
  after: {},
  surface: "ui",
  agent_run_id: null,
  reverted: false,
  created_at: "2026-01-01T00:00:00Z",
};

const PROACTIVE_RUN = {
  id: "p1",
  routine_type: "daily_planning",
  routine_name: "Daily planning nudge",
  trigger_reason: "Daily planning is enabled and quiet hours ended.",
  trigger_data_summary: "No plan exists for today; three tasks are due.",
  related_entities: [{ entity_type: "task", entity_id: "t1", label: "Ship v2" }],
  policy_decision: "sent because daily planning is enabled",
  channels: ["app"],
  message_title: "Plan today",
  message_summary: "Aya suggested planning around due tasks.",
  message_body: "Want to plan before meetings start?",
  delivery_status: { app: "delivered" },
  outcome: "sent",
  agent_run_id: "r1",
  audit_log_ids: ["audit1"],
  dismissed_at: null,
  muted_at: null,
  created_at: "2026-01-01T01:00:00Z",
  updated_at: "2026-01-01T01:00:00Z",
};

function renderActivity(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const activity = createRoute({
    getParentRoute: () => root,
    path: "/activity",
    component: ActivityPage,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/activity"] });
  const router = createRouter({
    routeTree: root.addChildren([activity, login]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders audit entries and POSTs to revert when Undo is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/audit") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([AUDIT_ENTRY]), { status: 200 });
    }
    if (String(url).includes("/proactive-runs") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/revert") && init?.method === "POST") {
      return new Response(JSON.stringify({ ...AUDIT_ENTRY, reverted: true }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderActivity(fetchMock);

  // Wait for the activity page to render
  await screen.findByRole("heading", { name: "Activity" });

  // Assert the audit entry is rendered
  await screen.findByText("create");
  await screen.findByText("context");

  // Click Undo
  const undoBtn = screen.getByRole("button", { name: /undo/i });
  await userEvent.click(undoBtn);

  // Assert POST to /audit/<id>/revert fired
  await waitFor(() => {
    const revertCall = calls.find(
      ([url, init]) => String(url).includes(`/audit/${AUDIT_ENTRY.id}/revert`) && init?.method === "POST",
    );
    expect(revertCall).toBeDefined();
  });
});

/** Render the Activity page alongside stub /tasks and /people/$slug routes so
 * entity links resolve to real hrefs. */
function renderActivityWithLinks(entries: unknown[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), { status: 200 });
    }
    if (String(url).includes("/audit")) {
      return new Response(JSON.stringify(entries), { status: 200 });
    }
    if (String(url).includes("/proactive-runs")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const activity = createRoute({ getParentRoute: () => root, path: "/activity", component: ActivityPage });
  const login = createRoute({ getParentRoute: () => root, path: "/login", component: () => <div>login</div> });
  const tasks = createRoute({ getParentRoute: () => root, path: "/tasks", component: () => <div>tasks</div> });
  const person = createRoute({
    getParentRoute: () => root,
    path: "/people/$slug",
    component: () => <div>person</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/activity"] });
  const router = createRouter({ routeTree: root.addChildren([activity, login, tasks, person]), history });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("shows the entity name and deep-links editable entities to ?edit", async () => {
  renderActivityWithLinks([
    { ...AUDIT_ENTRY, id: "a2", entity_type: "task", entity_id: "t1", after: { title: "Ship v2" } },
  ]);

  await screen.findByRole("heading", { name: "Activity" });
  const link = await screen.findByRole("link", { name: "Ship v2" });
  const href = link.getAttribute("href") ?? "";
  expect(href).toContain("/tasks");
  expect(href).toContain("edit=t1");
});

it("filters audit entries to AI writes", async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), { status: 200 });
    }
    if (String(url).includes("/audit")) {
      const entries = String(url).includes("agent_runs_only=true")
        ? [
            {
              ...AUDIT_ENTRY,
              id: "a5",
              entity_type: "task",
              entity_id: "t2",
              after: { title: "Aya edit" },
              agent_run_id: "run1",
            },
          ]
        : [
            {
              ...AUDIT_ENTRY,
              id: "a4",
              entity_type: "task",
              entity_id: "t1",
              after: { title: "Human edit" },
            },
          ];
      return new Response(JSON.stringify(entries), { status: 200 });
    }
    if (String(url).includes("/proactive-runs")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const activity = createRoute({ getParentRoute: () => root, path: "/activity", component: ActivityPage });
  const login = createRoute({ getParentRoute: () => root, path: "/login", component: () => <div>login</div> });
  const tasks = createRoute({ getParentRoute: () => root, path: "/tasks", component: () => <div>tasks</div> });
  const history = createMemoryHistory({ initialEntries: ["/activity"] });
  const router = createRouter({ routeTree: root.addChildren([activity, login, tasks]), history });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  await screen.findByRole("heading", { name: "Activity" });
  await userEvent.click(screen.getByRole("button", { name: "AI Writes" }));

  expect(await screen.findByText("Aya edit")).toBeInTheDocument();
  expect(screen.queryByText("Human edit")).toBeNull();
  expect(calls.some((url) => url.includes("/audit") && url.includes("agent_runs_only=true"))).toBe(
    true,
  );
});

it("renders proactive run details and POSTs dismiss", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/audit")) {
      return new Response(JSON.stringify([AUDIT_ENTRY]), { status: 200 });
    }
    if (String(url).includes("/proactive-runs/p1/dismiss") && init?.method === "POST") {
      return new Response(JSON.stringify({ ...PROACTIVE_RUN, outcome: "dismissed" }), {
        status: 200,
      });
    }
    if (String(url).includes("/proactive-runs")) {
      return new Response(JSON.stringify([PROACTIVE_RUN]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderActivity(fetchMock);

  await screen.findByRole("heading", { name: "Activity" });
  await userEvent.click(screen.getByRole("button", { name: "Proactive" }));

  expect(await screen.findByText(PROACTIVE_RUN.trigger_reason)).toBeInTheDocument();
  expect(screen.getByText(PROACTIVE_RUN.trigger_data_summary)).toBeInTheDocument();
  expect(screen.getByText(/app: delivered/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ship v2" })).toHaveAttribute("href", expect.stringContaining("/tasks"));
  expect(screen.getByRole("link", { name: /tune policy/i })).toHaveAttribute("href", expect.stringContaining("/settings"));

  await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

  await waitFor(() => {
    expect(
      calls.find(
        ([url, init]) => String(url).includes("/proactive-runs/p1/dismiss") && init?.method === "POST",
      ),
    ).toBeDefined();
  });
});

it("links a person to its detail page by slug", async () => {
  renderActivityWithLinks([
    { ...AUDIT_ENTRY, id: "a3", entity_type: "person", entity_id: "p1", after: { name: "Ada Lovelace", slug: "ada" } },
  ]);

  await screen.findByRole("heading", { name: "Activity" });
  const link = await screen.findByRole("link", { name: "Ada Lovelace" });
  expect(link.getAttribute("href")).toContain("/people/ada");
});
