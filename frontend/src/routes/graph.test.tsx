import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

// Cytoscape touches a real canvas; mock it so the page renders under jsdom.
vi.mock("cytoscape-fcose", () => ({ default: {} }));
vi.mock("cytoscape", () => {
  const collection = {
    filter: () => collection,
    style: () => collection,
    length: 0,
  };
  const cy = {
    on: vi.fn(),
    destroy: vi.fn(),
    batch: (cb: () => void) => cb(),
    layout: () => ({ run: vi.fn() }),
    nodes: () => collection,
    animate: vi.fn(),
    resize: vi.fn(),
  };
  const fn = Object.assign(vi.fn(() => cy), { use: vi.fn() });
  return { default: fn };
});

import { GraphPage } from "./graph";

afterEach(() => vi.restoreAllMocks());

it("renders the graph page with controls and fetches the snapshot", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/auth/me")) {
        return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
          status: 200,
        });
      }
      if (u.includes("/graph/full")) {
        return new Response(JSON.stringify({ nodes: [], edges: [], truncated: false }), {
          status: 200,
        });
      }
      if (u.includes("/contexts")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );

  const root = createRootRoute();
  const graph = createRoute({ getParentRoute: () => root, path: "/graph", component: GraphPage });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/graph"] });
  const router = createRouter({ routeTree: root.addChildren([graph, login]), history });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  await screen.findByRole("heading", { name: "Graph" });
  expect(screen.getAllByRole("button", { name: /rebuild graph/i })[0]).toBeInTheDocument();
  expect(calls.some((u) => u.includes("/graph/full"))).toBe(true);
});

it("requires confirmation before rebuilding the graph from the toolbar", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/auth/me")) {
        return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
          status: 200,
        });
      }
      if (u.includes("/graph/full")) {
        return new Response(JSON.stringify({ nodes: [], edges: [], truncated: false }), {
          status: 200,
        });
      }
      if (u.includes("/contexts")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (u.includes("/admin/rebuild-graph")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );

  const root = createRootRoute();
  const graph = createRoute({ getParentRoute: () => root, path: "/graph", component: GraphPage });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/graph"] });
  const router = createRouter({ routeTree: root.addChildren([graph, login]), history });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  await screen.findByRole("heading", { name: "Graph" });
  const rebuild = screen.getAllByRole("button", { name: /rebuild graph/i })[0];
  await userEvent.click(rebuild);
  expect(calls.some((u) => u.includes("/admin/rebuild-graph"))).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: /confirm rebuild/i }));
  expect(calls.some((u) => u.includes("/admin/rebuild-graph"))).toBe(true);
});
