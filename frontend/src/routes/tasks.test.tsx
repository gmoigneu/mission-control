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
  projects: Array<{ id: string; title: string }> = [],
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
            color: null,
            created_at: "",
            updated_at: "",
          })),
        ),
        { status: 200 },
      );
    }
    if (String(url).includes("/projects") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify(
          projects.map((p) => ({
            id: p.id,
            context_id: "",
            slug: p.id,
            title: p.title,
            status: "active",
            purpose: null,
            body: null,
            created_at: "",
            updated_at: "",
          })),
        ),
        { status: 200 },
      );
    }
    if (String(url).includes("/tasks") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify(tasks), { status: 200 });
    }
    if (init?.method === "PATCH" && /\/tasks\//.test(String(url))) {
      return new Response(JSON.stringify({ ...tasks[0], ...JSON.parse(String(init.body)) }), {
        status: 200,
      });
    }
    if (init?.method === "DELETE" && /\/tasks\//.test(String(url))) {
      return new Response(null, { status: 204 });
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

  await userEvent.click(screen.getByRole("button", { name: /new/i }));

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

it("hides done/archived tasks by default and reveals them via Show completed", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [
    makeTask({ id: "t1", title: "Open one", status: "open" }),
    makeTask({ id: "t2", title: "Working", status: "in_progress" }),
    makeTask({ id: "t3", title: "Finished", status: "done" }),
    makeTask({ id: "t4", title: "Old one", status: "archived" }),
  ];
  renderTasks(fetchMockFor(tasks, calls));

  await screen.findByRole("heading", { name: "Tasks" });

  // Open + in-progress are visible; done + archived are hidden by default.
  const openGroup = await screen.findByRole("region", { name: "Open" });
  expect(within(openGroup).getByText("Open one")).toBeDefined();
  expect(screen.getByRole("region", { name: "In progress" })).toBeDefined();
  expect(screen.queryByText("Finished")).toBeNull();
  expect(screen.queryByText("Old one")).toBeNull();
  expect(screen.queryByRole("region", { name: "Done" })).toBeNull();

  // Toggling "Show completed" reveals the done + archived groups.
  await userEvent.click(screen.getByRole("button", { name: /show completed/i }));
  const doneGroup = await screen.findByRole("region", { name: "Done" });
  expect(within(doneGroup).getByText("Finished")).toBeDefined();
  expect(within(screen.getByRole("region", { name: "Archived" })).getByText("Old one")).toBeDefined();
});

it("orders status groups with In progress first", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [
    makeTask({ id: "t1", title: "Open one", status: "open" }),
    makeTask({ id: "t2", title: "Working", status: "in_progress" }),
  ];
  renderTasks(fetchMockFor(tasks, calls));

  await screen.findByRole("heading", { name: "Tasks" });
  await screen.findByRole("region", { name: "In progress" });

  const regions = screen.getAllByRole("region");
  const labels = regions.map((r) => r.getAttribute("aria-label"));
  expect(labels.indexOf("In progress")).toBeLessThan(labels.indexOf("Open"));
});

it("shows the project name in the list", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [makeTask({ id: "t1", title: "Has project", status: "open", project_id: "p1" })];
  renderTasks(fetchMockFor(tasks, calls, [], [{ id: "p1", title: "Apollo" }]));

  await screen.findByRole("heading", { name: "Tasks" });
  // Scope to the table region — the name also appears in the Project filter <option>.
  const region = await screen.findByRole("region", { name: "Open" });
  expect(await within(region).findByText("Apollo")).toBeDefined();
});

it("shows the context name in the list", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [makeTask({ id: "t1", title: "Has context", status: "open", context_id: "c1" })];
  renderTasks(fetchMockFor(tasks, calls, [{ id: "c1", name: "Work" }]));

  await screen.findByRole("heading", { name: "Tasks" });
  // Scope to the table region — the name also appears in the Context filter <option>.
  const region = await screen.findByRole("region", { name: "Open" });
  expect(await within(region).findByText("Work")).toBeDefined();
});

it("filters tasks by project", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [
    makeTask({ id: "t1", title: "Apollo task", status: "open", project_id: "p1" }),
    makeTask({ id: "t2", title: "Zephyr task", status: "open", project_id: "p2" }),
  ];
  renderTasks(
    fetchMockFor(tasks, calls, [], [
      { id: "p1", title: "Apollo" },
      { id: "p2", title: "Zephyr" },
    ]),
  );

  await screen.findByRole("heading", { name: "Tasks" });
  expect(await screen.findByText("Apollo task")).toBeDefined();
  expect(screen.getByText("Zephyr task")).toBeDefined();

  const filter = screen.getByRole("combobox", { name: /project filter/i });
  await waitFor(() => {
    expect(within(filter).getByRole("option", { name: "Apollo" })).toBeDefined();
  });
  await userEvent.selectOptions(filter, "p1");

  await waitFor(() => {
    expect(screen.queryByText("Zephyr task")).toBeNull();
  });
  expect(screen.getByText("Apollo task")).toBeDefined();
});

it("opens the edit panel when a task title is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [makeTask({ id: "t1", title: "Click me", status: "open" })];
  renderTasks(fetchMockFor(tasks, calls));

  await screen.findByRole("heading", { name: "Tasks" });
  await userEvent.click(screen.getByRole("button", { name: "Click me" }));

  // The SidePanel dialog opens in edit mode.
  expect(await screen.findByRole("dialog", { name: "Edit task" })).toBeDefined();
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
  expect(screen.getByRole("region", { name: "In progress" })).toBeDefined();
  expect(screen.getByRole("region", { name: "Done" })).toBeDefined();
  expect(screen.getByRole("region", { name: "Archived" })).toBeDefined();
});

it("PATCHes the task status via the status badge menu", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [makeTask({ id: "t1", title: "Move me", status: "open" })];
  renderTasks(fetchMockFor(tasks, calls));

  await screen.findByRole("heading", { name: "Tasks" });

  const openGroup = await screen.findByRole("region", { name: "Open" });
  // Click the clickable status badge to open its menu, then pick a new status.
  await userEvent.click(within(openGroup).getByRole("button", { name: /change status/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: "In progress" }));

  await waitFor(() => {
    const patchCall = calls.find(
      ([url, init]) => /\/tasks\/t1$/.test(String(url)) && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]!.body as string);
    expect(body.status).toBe("in_progress");
  });
});

it("renders a markdown preview of the description", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  renderTasks(fetchMockFor([], calls));

  await screen.findByRole("heading", { name: "Tasks" });
  await userEvent.click(screen.getByRole("button", { name: /new/i }));

  await userEvent.type(
    screen.getByRole("textbox", { name: /description/i }),
    "# Preview Heading",
  );
  await userEvent.click(screen.getByRole("button", { name: /^preview$/i }));

  const preview = screen.getByTestId("description-preview");
  expect(within(preview).getByRole("heading", { name: "Preview Heading" })).toBeDefined();
});

it("deletes a task from the edit panel", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const tasks = [makeTask({ id: "t1", title: "Delete me", status: "open" })];
  renderTasks(fetchMockFor(tasks, calls));

  await screen.findByRole("heading", { name: "Tasks" });
  await userEvent.click(screen.getByRole("button", { name: "Delete me" }));
  await screen.findByRole("dialog", { name: "Edit task" });

  // ConfirmButton arms on first click, fires on the second.
  const del = screen.getByRole("button", { name: /delete task/i });
  await userEvent.click(del);
  await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

  await waitFor(() => {
    const delCall = calls.find(
      ([url, init]) => /\/tasks\/t1$/.test(String(url)) && init?.method === "DELETE",
    );
    expect(delCall).toBeDefined();
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
