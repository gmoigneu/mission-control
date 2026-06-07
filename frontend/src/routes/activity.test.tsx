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
  reverted: false,
  created_at: "2026-01-01T00:00:00Z",
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

it("links a person to its detail page by slug", async () => {
  renderActivityWithLinks([
    { ...AUDIT_ENTRY, id: "a3", entity_type: "person", entity_id: "p1", after: { name: "Ada Lovelace", slug: "ada" } },
  ]);

  await screen.findByRole("heading", { name: "Activity" });
  const link = await screen.findByRole("link", { name: "Ada Lovelace" });
  expect(link.getAttribute("href")).toContain("/people/ada");
});
