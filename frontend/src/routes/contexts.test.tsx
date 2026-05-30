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
import { ContextsPage } from "./contexts";

afterEach(() => vi.restoreAllMocks());

function renderContexts(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const contexts = createRoute({
    getParentRoute: () => root,
    path: "/contexts",
    component: ContextsPage,
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
  const history = createMemoryHistory({ initialEntries: ["/contexts"] });
  const router = createRouter({
    routeTree: root.addChildren([contexts, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the contexts page and POSTs when Add is clicked", async () => {
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
    if (String(url).includes("/contexts") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "c1",
          slug: "test-slug",
          name: "Test Name",
          category: "",
          description: null,
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderContexts(fetchMock);

  // Wait for the page to render (RequireAuth resolves)
  await screen.findByRole("heading", { name: "Contexts" });

  // Type into the form inputs
  await userEvent.type(screen.getByRole("textbox", { name: /name/i }), "Test Name");
  await userEvent.type(screen.getByRole("textbox", { name: /slug/i }), "test-slug");

  // Click Add
  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  // Assert a POST to /contexts was fired with the entered values
  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/contexts") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.name).toBe("Test Name");
    expect(body.slug).toBe("test-slug");
  });
});
