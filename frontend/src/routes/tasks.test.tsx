import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { TasksPage } from "./tasks";

afterEach(() => vi.restoreAllMocks());

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    status: "open",
    priority: "normal",
    due: null,
    scheduled: null,
    context_id: null,
    project_id: null,
    outcome: null,
    body: null,
    source: null,
    completed_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

/** A fetch mock that serves the supplied tasks for GET /tasks and records calls. */
function fetchMockFor(
  tasks: Task[],
  calls: Array<[string, RequestInit | undefined]>,
  contexts: Array<{ id: string; name: string }> = [],
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/contexts") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify(
          contexts.map((c) => ({
            id: c.id,
            slug: c.id,
            name: c.name,
            category: "work",
            description: null,
            status: "active",
            created_at: "",
            updated_at: "",
          })),
        ),
        { status: 200 },
      );
    }
    if (String(url).includes("/projects") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/tasks") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify(tasks), { status: 200 });
    }
    if (init?.method === "PATCH" && /\/tasks\//.test(String(url))) {
      return new Response(JSON.stringify({ ...tasks[0], ...JSON.parse(String(init.body)) }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

function renderTasks(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const tasks = createRoute({
    getParentRoute: () => root,
    path: "/tasks",
    component: TasksPage,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const activity = createRoute({
    getParentRoute: () => root,
    path: "/activity",
    component: () => <div>activity-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/tasks"] });
  const router = createRouter({
    routeTree: root.addChildren([tasks, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the tasks page and POSTs with title; empty optional fields are omitted", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/contexts") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/projects") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/tasks") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/tasks") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "t1",
          title: "My Task",
          status: "open",
          priority: "normal",
          due: null,
          scheduled: null,
          context_id: null,
          project_id: null,
          outcome: null,
          body: null,
          source: null,
          completed_at: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderTasks(fetchMock);

  // Wait for the page to render (RequireAuth resolves)
  await screen.findByRole("heading", { name: "Tasks" });

  // Type the title — leave all optional fields empty
  await userEvent.type(screen.getByRole("textbox", { name: /title/i }), "My Task");

  // Click Add
  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  // Assert a POST to /tasks was fired with the title
  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/tasks") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.title).toBe("My Task");
    // Empty optional FK selects and date fields must NOT be sent as ""
    expect(body.context_id).not.toBe("");
    expect(body.project_id).not.toBe("");
    expect(body.due).not.toBe("");
    expect(body.scheduled).not.toBe("");
    // They should be absent from the payload (not sent at all)
    expect("context_id" in body).toBe(false);
    expect("project_id" in body).toBe(false);
    expect("due" in body).toBe(false);
    expect("scheduled" in body).toBe(false);
  });
});

it("groups tasks by status in the list view", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [
    makeTask({ id: "t1", title: "Open one", status: "open" }),
    makeTask({ id: "t2", title: "Working", status: "in_progress" }),
    makeTask({ id: "t3", title: "Finished", status: "done" }),
  ];
  renderTasks(fetchMockFor(tasks, calls));

  await screen.findByRole("heading", { name: "Tasks" });

  // Each status group is a labelled section; rows live under their group.
  const openGroup = await screen.findByRole("region", { name: "Open" });
  expect(within(openGroup).getByText("Open one")).toBeDefined();

  const progressGroup = screen.getByRole("region", { name: "In Progress" });
  expect(within(progressGroup).getByText("Working")).toBeDefined();

  const doneGroup = screen.getByRole("region", { name: "Done" });
  expect(within(doneGroup).getByText("Finished")).toBeDefined();
});

it("toggles to the board view with a column per status", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [makeTask({ id: "t1", title: "Board task", status: "open" })];
  renderTasks(fetchMockFor(tasks, calls));

  await screen.findByRole("heading", { name: "Tasks" });

  await userEvent.click(screen.getByRole("button", { name: "Board" }));

  // The board renders a labelled column for every status, including empty ones.
  const openColumn = screen.getByRole("region", { name: "Open" });
  expect(within(openColumn).getByText("Board task")).toBeDefined();
  expect(screen.getByRole("region", { name: "In Progress" })).toBeDefined();
  expect(screen.getByRole("region", { name: "Done" })).toBeDefined();
  expect(screen.getByRole("region", { name: "Archived" })).toBeDefined();
});

it("PATCHes the task status when changed inline", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [makeTask({ id: "t1", title: "Move me", status: "open" })];
  renderTasks(fetchMockFor(tasks, calls));

  await screen.findByRole("heading", { name: "Tasks" });

  const openGroup = await screen.findByRole("region", { name: "Open" });
  // The inline status <select> lives inside the row for this task.
  const statusSelect = within(openGroup).getByRole("combobox");
  await userEvent.selectOptions(statusSelect, "in_progress");

  await waitFor(() => {
    const patchCall = calls.find(
      ([url, init]) => /\/tasks\/t1$/.test(String(url)) && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]!.body as string);
    expect(body.status).toBe("in_progress");
  });
});

it("filters tasks by context", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [
    makeTask({ id: "t1", title: "In work ctx", status: "open", context_id: "c1" }),
    makeTask({ id: "t2", title: "No ctx", status: "open" }),
  ];
  renderTasks(fetchMockFor(tasks, calls, [{ id: "c1", name: "Work" }]));

  await screen.findByRole("heading", { name: "Tasks" });
  expect(await screen.findByText("In work ctx")).toBeDefined();
  expect(screen.getByText("No ctx")).toBeDefined();

  // The context filter <select> is labelled "Context filter" in the toolbar.
  // ("Work" appears both in the create form's Context select and the filter.)
  const filter = screen.getByRole("combobox", { name: /context filter/i });
  await waitFor(() => {
    expect(within(filter).getByRole("option", { name: "Work" })).toBeDefined();
  });
  await userEvent.selectOptions(filter, "c1");

  await waitFor(() => {
    expect(screen.queryByText("No ctx")).toBeNull();
  });
  expect(screen.getByText("In work ctx")).toBeDefined();
});
