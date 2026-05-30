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
import { RelationshipsPage } from "./relationships";

afterEach(() => vi.restoreAllMocks());

function renderRelationships(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const relationships = createRoute({
    getParentRoute: () => root,
    path: "/relationships",
    component: RelationshipsPage,
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
  const history = createMemoryHistory({ initialEntries: ["/relationships"] });
  const router = createRouter({
    routeTree: root.addChildren([relationships, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the relationships page and POSTs with from/to person ids when Add is clicked", async () => {
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
            name: "A",
            slug: "a",
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
          {
            id: "p2",
            name: "B",
            slug: "b",
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
    if (String(url).includes("/contexts") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/relationships") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/relationships") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "r1",
          from_person_id: "p1",
          to_person_id: "p2",
          type: "knows",
          context_id: null,
          since: null,
          notes: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderRelationships(fetchMock);

  await screen.findByRole("heading", { name: "Relationships" });

  // Wait for people options to load then select from/to
  await waitFor(() => {
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  const [fromSelect, toSelect] = screen.getAllByRole("combobox");
  await userEvent.selectOptions(fromSelect, "p1");
  await userEvent.selectOptions(toSelect, "p2");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/relationships") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.from_person_id).toBe("p1");
    expect(body.to_person_id).toBe("p2");
  });
});
