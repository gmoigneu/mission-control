import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TasksPage } from "./tasks";

afterEach(() => vi.restoreAllMocks());

interface MockData {
  tasks?: unknown[];
  contexts?: unknown[];
  projects?: unknown[];
}

/** Build a fetch mock that serves auth + GET list endpoints and records every call. */
function makeFetchMock(data: MockData = {}) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    const u = String(url);
    const isGet = !init?.method || init.method === "GET";
    if (u.includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (u.includes("/contexts") && isGet) {
      return new Response(JSON.stringify(data.contexts ?? []), { status: 200 });
    }
    if (u.includes("/projects") && isGet) {
      return new Response(JSON.stringify(data.projects ?? []), { status: 200 });
    }
    if (u.includes("/tasks") && isGet) {
      return new Response(JSON.stringify(data.tasks ?? []), { status: 200 });
    }
    if (u.includes("/tasks") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: "t1", ...body }), { status: 200 });
    }
    if (u.includes("/tasks") && init?.method === "POST") {
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
  return { fetchMock, calls };
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
  const { fetchMock, calls } = makeFetchMock();

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

it("switches to the board view with a column per status", async () => {
  const { fetchMock } = makeFetchMock({
    tasks: [
      { id: "t1", title: "Open task", status: "open", priority: "normal", due: null, context_id: null, project_id: null },
      { id: "t2", title: "Doing task", status: "in_progress", priority: "normal", due: null, context_id: null, project_id: null },
    ],
  });
  renderTasks(fetchMock);
  await screen.findByText("Open task");

  fireEvent.change(screen.getByLabelText("View"), { target: { value: "board" } });

  expect(await screen.findByText("Open (1)")).toBeInTheDocument();
  expect(screen.getByText("In Progress (1)")).toBeInTheDocument();
  expect(screen.getByText("Done (0)")).toBeInTheDocument();
  expect(screen.getByText("Archived (0)")).toBeInTheDocument();
});

it("groups tasks by status in the list view", async () => {
  const { fetchMock } = makeFetchMock({
    tasks: [
      { id: "t1", title: "Open task", status: "open", priority: "normal", due: null, context_id: null, project_id: null },
      { id: "t2", title: "Done task", status: "done", priority: "normal", due: null, context_id: null, project_id: null },
    ],
  });
  renderTasks(fetchMock);
  await screen.findByText("Open task");

  fireEvent.change(screen.getByLabelText("View"), { target: { value: "list" } });

  expect(await screen.findByText("Open (1)")).toBeInTheDocument();
  expect(screen.getByText("Done (1)")).toBeInTheDocument();
});

it("changes a task status inline via the table select", async () => {
  const { fetchMock, calls } = makeFetchMock({
    tasks: [
      { id: "t1", title: "First task", status: "open", priority: "normal", due: null, context_id: null, project_id: null },
    ],
  });
  renderTasks(fetchMock);
  await screen.findByText("First task");

  // Scope to the table so we don't hit the create-form's Status select
  // (which also defaults to "open"). The row's inline status select is the
  // one whose current value is "open".
  const table = screen.getByRole("table");
  const selects = within(table).getAllByRole("combobox") as HTMLSelectElement[];
  const statusSelect = selects.find((s) => s.value === "open");
  expect(statusSelect).toBeDefined();
  fireEvent.change(statusSelect!, { target: { value: "done" } });

  await waitFor(() => {
    const patchCall = calls.find(
      ([url, init]) => String(url).includes("/tasks/t1") && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]!.body as string);
    expect(body.status).toBe("done");
  });
});

it("filters tasks by context", async () => {
  const { fetchMock } = makeFetchMock({
    tasks: [
      { id: "t1", title: "Work task", status: "open", priority: "normal", due: null, context_id: "c1", project_id: null },
      { id: "t2", title: "Home task", status: "open", priority: "normal", due: null, context_id: "c2", project_id: null },
    ],
    contexts: [
      { id: "c1", slug: "work", name: "Work", category: "work", description: null, status: "open", created_at: "", updated_at: "" },
      { id: "c2", slug: "home", name: "Home", category: "personal", description: null, status: "open", created_at: "", updated_at: "" },
    ],
  });
  renderTasks(fetchMock);
  await screen.findByText("Work task");

  fireEvent.change(screen.getByLabelText("Filter context"), {
    target: { value: "c1" },
  });

  expect(screen.getByText("Work task")).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText("Home task")).not.toBeInTheDocument();
  });
});
