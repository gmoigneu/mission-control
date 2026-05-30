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
import { ObservationsPage } from "./observations";

afterEach(() => vi.restoreAllMocks());

function renderObservations(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const observations = createRoute({
    getParentRoute: () => root,
    path: "/observations",
    component: ObservationsPage,
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
  const history = createMemoryHistory({ initialEntries: ["/observations"] });
  const router = createRouter({
    routeTree: root.addChildren([observations, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the observations page and POSTs with subject_type/subject_id/body when Add is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/people") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "p1",
            name: "Alice",
            slug: "alice",
            role: null,
            company_id: null,
            email: null,
            linkedin: null,
            first_met: null,
            primary_context_id: null,
            summary: null,
            archived: false,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/observations") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/observations") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "o1",
          subject_type: "person",
          subject_id: "p1",
          kind: "observation",
          body: "Test body",
          date: null,
          source: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      );
    }
    // All other list endpoints (projects, contexts, tasks, companies) return empty arrays
    return new Response(JSON.stringify([]), { status: 200 });
  });

  renderObservations(fetchMock);

  await screen.findByRole("heading", { name: "Observations" });

  // Select subject_type = "person" in the first combobox of SubjectPicker
  // comboboxes[0] = subject type select, comboboxes[1] = subject id select, comboboxes[2] = kind select
  const comboboxes = screen.getAllByRole("combobox");
  await userEvent.selectOptions(comboboxes[0], "person");

  // Wait for people options to load in the SubjectPicker id select
  await waitFor(() => {
    expect(screen.getByRole("option", { name: "Alice" })).toBeDefined();
  });

  await userEvent.selectOptions(comboboxes[1], "p1");

  // Type the body
  await userEvent.type(screen.getByRole("textbox", { name: /body/i }), "Test body");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/observations") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.subject_type).toBe("person");
    expect(body.subject_id).toBe("p1");
    expect(body.body).toBe("Test body");
  });
});
