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
import { ProjectsPage } from "./projects";

afterEach(() => vi.restoreAllMocks());

function renderProjects(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const projects = createRoute({
    getParentRoute: () => root,
    path: "/projects",
    component: ProjectsPage,
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
  const history = createMemoryHistory({ initialEntries: ["/projects"] });
  const router = createRouter({
    routeTree: root.addChildren([projects, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the projects page and POSTs with context_id when Add is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/contexts") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "c1",
            slug: "upsun",
            name: "Upsun",
            category: "work",
            description: null,
            status: "active",
            created_at: "",
            updated_at: "",
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/projects") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/projects") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "p1",
          context_id: "c1",
          slug: "my-project",
          title: "My Project",
          status: "active",
          purpose: null,
          body: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderProjects(fetchMock);

  // Wait for the page to render (RequireAuth resolves)
  await screen.findByRole("heading", { name: "Projects" });

  await userEvent.click(screen.getByRole("button", { name: /new/i }));

  // Wait for the context select to populate with option "Upsun"
  await waitFor(() => {
    expect(screen.getByRole("option", { name: "Upsun" })).toBeDefined();
  });

  // Select the context — the first <select> (combobox) is the Context field
  const selects = screen.getAllByRole("combobox");
  await userEvent.selectOptions(selects[0], "c1");

  // Type title and slug
  await userEvent.type(screen.getByRole("textbox", { name: /title/i }), "My Project");
  await userEvent.type(screen.getByRole("textbox", { name: /slug/i }), "my-project");

  // Click Add
  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  // Assert a POST to /projects was fired with context_id, title, slug
  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/projects") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.context_id).toBe("c1");
    expect(body.title).toBe("My Project");
    expect(body.slug).toBe("my-project");
  });
});
