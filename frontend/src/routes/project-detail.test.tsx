import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectDetailPage } from "./project-detail";

vi.mock("cytoscape-fcose", () => ({ default: {} }));
vi.mock("cytoscape", () => {
  const collection = {
    filter: () => collection,
    style: () => collection,
    unselect: () => collection,
    select: () => collection,
    length: 1,
  };
  const cy = {
    on: vi.fn(),
    destroy: vi.fn(),
    batch: (cb: () => void) => cb(),
    nodes: () => collection,
    animate: vi.fn(),
    resize: vi.fn(),
    getElementById: () => collection,
  };
  const fn = Object.assign(vi.fn(() => cy), { use: vi.fn() });
  return { default: fn };
});

afterEach(() => vi.restoreAllMocks());

function renderProjectDetail(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/projects/$slug",
    component: ProjectDetailPage,
  });
  const projects = createRoute({
    getParentRoute: () => root,
    path: "/projects",
    component: () => <div>projects-page</div>,
  });
  const graph = createRoute({
    getParentRoute: () => root,
    path: "/graph",
    component: () => <div>graph-page</div>,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/projects/launch-plan"] });
  const router = createRouter({
    routeTree: root.addChildren([detail, projects, graph, login]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders a project detail page with a two-hop embedded graph", async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (u.includes("/projects/by-slug/launch-plan") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify({
          id: "p1",
          context_id: "c1",
          slug: "launch-plan",
          title: "Launch Plan",
          status: "active",
          purpose: "Ship the launch",
          body: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 200 },
      );
    }
    if (u.includes("/contexts") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "c1",
            slug: "upsun",
            name: "Upsun",
            category: "work",
            description: null,
            status: "active",
            color: null,
            created_at: "",
            updated_at: "",
          },
        ]),
        { status: 200 },
      );
    }
    if (u.includes("/graph/neighborhood/p1") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify({
          nodes: [
            { id: "p1", label: "Project", name: "Launch Plan", props: { slug: "launch-plan" } },
            { id: "c1", label: "Context", name: "Upsun", props: { slug: "upsun" } },
          ],
          edges: [{ source: "p1", target: "c1", type: "IN_CONTEXT", props: {} }],
          truncated: false,
        }),
        { status: 200 },
      );
    }
    if (u.includes("/graph/node/p1") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify({
          id: "p1",
          label: "Project",
          props: { title: "Launch Plan", slug: "launch-plan" },
          rels: [{ rel: "IN_CONTEXT", dir: "out", id: "c1", label: "Context", name: "Upsun" }],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderProjectDetail(fetchMock);

  await screen.findByRole("heading", { name: "Launch Plan" });
  expect(await screen.findByText("Upsun")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open in graph" })).toHaveAttribute(
    "href",
    "/graph?node=p1&depth=2",
  );
  expect(calls.some((u) => u.includes("/graph/neighborhood/p1?depth=2"))).toBe(true);
});
