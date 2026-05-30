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
import { LoginPage } from "./login";

afterEach(() => vi.restoreAllMocks());

function renderLogin() {
  const root = createRootRoute();
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: LoginPage,
  });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <div>dashboard-home</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/login"] });
  const router = createRouter({ routeTree: root.addChildren([login, index]), history });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("submits credentials and calls the login endpoint", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ id: "1", email: "g@x.com" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  renderLogin();
  await screen.findByRole("heading", { name: "Sign in" });
  await userEvent.type(screen.getByLabelText("Email"), "g@x.com");
  await userEvent.type(screen.getByLabelText("Password"), "secret");
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() => {
    const calls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(calls.some((u) => u.includes("/auth/login"))).toBe(true);
  });
});
