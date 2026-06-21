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
import { AyaProvider } from "../features/agent/AyaContext";
import { Dashboard } from "./index";
import { tasksSearch } from "./tasks-search";

afterEach(() => {
  vi.restoreAllMocks();
});

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function renderDashboard(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: Dashboard,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const tasks = createRoute({
    getParentRoute: () => root,
    path: "/tasks",
    validateSearch: tasksSearch,
    component: () => <div>tasks-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree: root.addChildren([home, login, tasks]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AyaProvider>
        <RouterProvider router={router} />
      </AyaProvider>
    </QueryClientProvider>,
  );
}

it("saves mood, energy, and productivity quick-add values", async () => {
  const today = todayISO();
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes(`/daily-checkins/${today}`) && init?.method === "PUT") {
      const body = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({
          id: "j1",
          date: today,
          mood: body.mood ?? 2,
          energy: body.energy ?? 3,
          productivity: body.productivity ?? 4,
          updated_at: `${today}T08:00:00Z`,
        }),
        { status: 200 },
      );
    }
    if (String(url).includes("/daily-checkins")) {
      return new Response(
        JSON.stringify([
          {
            id: "j1",
            date: today,
            mood: 2,
            energy: 3,
            productivity: 4,
            updated_at: `${today}T07:00:00Z`,
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/tasks")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/contexts")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/audit")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/journal-entries")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/habits")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/projects")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderDashboard(fetchMock);

  await screen.findByRole("button", { name: "Mood 4 of 5" });

  await userEvent.click(screen.getByRole("button", { name: "Mood 4 of 5" }));

  await waitFor(() => {
    const putCall = calls.find(
      ([url, init]) =>
        String(url).includes(`/daily-checkins/${today}`) && init?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    expect(JSON.parse(putCall![1]!.body as string)).toEqual({ mood: 4 });
  });

  expect(screen.getByRole("button", { name: "Productivity 5 of 5" })).toBeInTheDocument();
});

it("renders dashboard journal markdown, task context links, and activity labels", async () => {
  const today = todayISO();
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/daily-checkins")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/tasks")) {
      return new Response(
        JSON.stringify([
          {
            id: "t1",
            title: "Draft spec",
            status: "open",
            priority: "normal",
            due: today,
            scheduled: null,
            context_id: "c1",
            project_id: null,
            outcome: null,
            body: null,
            source: null,
            completed_at: null,
            created_at: "",
            updated_at: "",
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/contexts")) {
      return new Response(
        JSON.stringify([
          {
            id: "c1",
            slug: "work",
            name: "Work",
            category: "work",
            description: "Work context",
            status: "active",
            color: null,
            created_at: "",
            updated_at: "",
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/audit")) {
      return new Response(
        JSON.stringify([
          {
            id: "a1",
            actor: "agent",
            action: "update",
            entity_type: "task",
            entity_id: "t1",
            before: null,
            after: null,
            surface: "ui",
            reverted: false,
            created_at: new Date().toISOString(),
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/journal-entries")) {
      return new Response(
        JSON.stringify([
          {
            id: "j1",
            date: today,
            title: "Morning notes",
            body: "# Plan\n\n- [ ] Write **notes**",
            mood: null,
            energy: null,
            productivity: null,
            source: null,
            created_at: "",
            updated_at: "",
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/habits")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/projects")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderDashboard(fetchMock);

  expect(await screen.findByRole("heading", { name: "Plan" })).toBeDefined();
  const contextLink = await screen.findByRole("link", { name: /Work/ });
  expect(contextLink).toHaveAttribute("href", expect.stringContaining("context=c1"));
  expect(await screen.findAllByText("Draft spec")).toHaveLength(2);
  expect(screen.queryByText("t1")).toBeNull();
});
