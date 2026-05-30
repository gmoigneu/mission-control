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
import { TasksPage } from "./tasks";

afterEach(() => vi.restoreAllMocks());

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
