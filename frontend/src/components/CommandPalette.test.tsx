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

function renderShell(fetchImpl?: typeof fetch) {
  // /me succeeds so AppShell renders; all other endpoints return empty.
  vi.stubGlobal(
    "fetch",
    fetchImpl ??
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
  expect(screen.getByRole("textbox", { name: "Command palette search" })).toHaveFocus();
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

it("marks the highlighted command as current", async () => {
  const user = userEvent.setup();
  renderShell();
  await openPalette(user);

  // With no query, the first nav command (Dashboard) is active.
  expect(document.getElementById("cmdk-nav-dashboard")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await user.keyboard("{ArrowDown}");
  expect(document.getElementById("cmdk-nav-contexts")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

it("shows a capture preview and applies the selected action", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url);
    if (path.endsWith("/api/auth/me")) {
      return new Response(JSON.stringify({ id: "1", email: "g@x.com", name: "G" }), { status: 200 });
    }
    if (path.endsWith("/api/agent/capture")) {
      return new Response(
        JSON.stringify({
          agent_run_id: "r1",
          reply: "Capture preview ready.",
          conversation_id: null,
          writes: [],
          capture: {
            id: "c1",
            raw_text: "Create a task to call Sarah",
            transcript: null,
            source_surface: "cmd_k",
            source_metadata: {},
            status: "previewed",
            confidence_summary: { confidence: 0.92 },
            structured_result: {},
            agent_run_id: "r1",
            created_entity_refs: [],
            inbox_item_id: null,
            created_at: "2026-06-22T00:00:00Z",
            updated_at: "2026-06-22T00:00:00Z",
          },
          result: {
            intent: "create_task",
            confidence: 0.92,
            ambiguity_notes: [],
            suggested_next_action: "Create a task",
            proposed_actions: [
              {
                id: "task-1",
                intent: "create_task",
                entity_type: "task",
                confidence: 0.92,
                fields: {
                  title: "call Sarah",
                  status: "open",
                  priority: "normal",
                  body: "Create a task to call Sarah",
                },
                required_fields: ["title"],
                missing_fields: [],
                warnings: [],
                selected: true,
              },
            ],
          },
        }),
        { status: 200 },
      );
    }
    if (path.endsWith("/api/agent/captures/c1/apply")) {
      return new Response(
        JSON.stringify({
          agent_run_id: "r2",
          reply: "Capture applied.",
          writes: [{ id: "a1", action: "create", entity_type: "task", entity_id: "t1" }],
          capture: null,
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
  });
  renderShell(fetchMock as typeof fetch);
  await openPalette(user);

  await user.type(
    screen.getByRole("textbox", { name: "Command palette search" }),
    "Create a task to call Sarah",
  );
  await user.click(screen.getByRole("option", { name: /Capture with Aya/ }));

  expect(await screen.findByRole("region", { name: "Capture preview" })).toBeInTheDocument();
  expect(screen.getByDisplayValue("call Sarah")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Apply selected" }));

  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/agent/captures/c1/apply",
    expect.objectContaining({ method: "POST" }),
  );
});
