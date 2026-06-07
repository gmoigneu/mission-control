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

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Render AppShell behind the providers it needs (router + react-query). */
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
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("starts with the Aya panel open by default", async () => {
  renderAppShell();
  // The dock is open: its close control is present, the topbar re-open control is not.
  expect(await screen.findByLabelText("Close Aya")).toBeInTheDocument();
  expect(screen.queryByLabelText("Open Aya")).toBeNull();
});

it("restores the closed Aya panel from localStorage on mount (survives navigation remount)", async () => {
  // A prior page closed the panel; navigating remounts AppShell. The closed
  // choice must be honored instead of resetting to the default-open state.
  localStorage.setItem("mc-aya-open", "false");
  renderAppShell();

  expect(await screen.findByLabelText("Open Aya")).toBeInTheDocument();
  expect(screen.queryByLabelText("Close Aya")).toBeNull();
});

it("persists the closed state to localStorage when the panel is closed", async () => {
  renderAppShell();

  await userEvent.click(await screen.findByLabelText("Close Aya"));

  expect(localStorage.getItem("mc-aya-open")).toBe("false");
  // And the panel is actually closed in the DOM.
  expect(await screen.findByLabelText("Open Aya")).toBeInTheDocument();
});
