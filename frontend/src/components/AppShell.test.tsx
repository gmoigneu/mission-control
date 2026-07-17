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
import { AppShell } from "./AppShell";
import { AyaProvider } from "../features/agent/AyaProvider";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Render AppShell behind the providers it needs (router + react-query + Aya). */
function renderAppShell() {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    // persona, contexts, etc. — empty payloads are fine for the chrome.
    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <AppShell>
        <div>home-content</div>
      </AppShell>
    ),
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree: root.addChildren([home, login]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AyaProvider>
        <RouterProvider router={router} />
      </AyaProvider>
    </QueryClientProvider>,
  );
}

it("renders the Aya toggle in the top bar, closed by default", async () => {
  renderAppShell();
  const toggle = await screen.findByLabelText("Toggle Aya");
  expect(toggle).toBeInTheDocument();
  // The quake window lives at the route root, not in AppShell — AppShell only
  // exposes the toggle, which reflects the (closed) shared state.
  expect(toggle).toHaveAttribute("aria-pressed", "false");
});

it("flips the shared Aya open state when the toggle is clicked", async () => {
  renderAppShell();
  const toggle = await screen.findByLabelText("Toggle Aya");

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "true");

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "false");
});

it("updates the desktop navigation toggle label when collapsed", async () => {
  renderAppShell();
  const collapse = await screen.findByRole("button", { name: "Collapse navigation" });

  expect(collapse).toHaveAttribute("title", "Collapse navigation");

  await userEvent.click(collapse);

  const expand = await screen.findByRole("button", { name: "Expand navigation" });
  expect(expand).toHaveAttribute("title", "Expand navigation");
});
