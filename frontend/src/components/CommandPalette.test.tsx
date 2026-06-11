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
import { AppShell } from "./AppShell";

afterEach(() => vi.restoreAllMocks());

function renderShell() {
  // /me succeeds so AppShell renders; all other endpoints return empty.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ id: "1", email: "g@x.com", name: "G" }), {
        status: 200,
      }),
    ),
  );

  const root = createRootRoute();
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <AppShell>
        <div>home</div>
      </AppShell>
    ),
  });
  const tasks = createRoute({
    getParentRoute: () => root,
    path: "/tasks",
    component: () => <div>tasks-page</div>,
  });
  const search = createRoute({
    getParentRoute: () => root,
    path: "/search",
    component: () => <div>search-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree: root.addChildren([index, tasks, search]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  // Wait for the shell to mount, then open the palette via the ⌘K shortcut.
  await screen.findByRole("button", { name: "Voice capture" });
  await user.keyboard("{Meta>}k{/Meta}");
  return screen.findByRole("dialog", { name: "Command palette" });
}

it("opens the command palette as an aria-modal dialog and focuses the input", async () => {
  const user = userEvent.setup();
  renderShell();
  const dialog = await openPalette(user);
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(screen.getByRole("combobox")).toHaveFocus();
});

it("acts on a nav entry via ArrowDown + Enter and closes the palette", async () => {
  const user = userEvent.setup();
  renderShell();
  await openPalette(user);

  // First nav entry is Dashboard; one ArrowDown selects Contexts, Enter acts.
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() => {
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).toBeNull();
  });
});

it("exposes the highlighted option via aria-activedescendant", async () => {
  const user = userEvent.setup();
  renderShell();
  await openPalette(user);

  const input = screen.getByRole("combobox");
  // With no query, the first nav option (Dashboard) is active.
  expect(input).toHaveAttribute("aria-activedescendant", "cmdk-nav-dashboard");
  await user.keyboard("{ArrowDown}");
  expect(input).toHaveAttribute("aria-activedescendant", "cmdk-nav-contexts");
});
