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
import { RequireAuth } from "./RequireAuth";

afterEach(() => vi.restoreAllMocks());

function renderWithRouter(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <RequireAuth>
        <div>protected-content</div>
      </RequireAuth>
    ),
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree: root.addChildren([index, login]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders protected content when the session is valid", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ id: "1", email: "g@x.com", name: "G" }), { status: 200 }),
  );
  renderWithRouter(fetchMock);
  await screen.findByText("protected-content");
  expect(screen.queryByText("login-page")).toBeNull();
});

it("redirects to /login when the session returns 401", async () => {
  const fetchMock = vi.fn(async () =>
    new Response("Unauthorized", { status: 401 }),
  );
  renderWithRouter(fetchMock);
  // After the query settles (isError=true), RequireAuth should redirect to /login
  await screen.findByText("login-page");
  expect(screen.queryByText("protected-content")).toBeNull();
});
