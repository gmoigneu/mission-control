import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PersonDetailPage } from "./person-detail";

afterEach(() => vi.restoreAllMocks());

function renderDetail(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  // Mirror the real route tree: a static /people list and the /people/$slug detail.
  const people = createRoute({
    getParentRoute: () => root,
    path: "/people",
    component: () => <div>people-list</div>,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/people/$slug",
    component: PersonDetailPage,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/people/jane-doe"] });
  const router = createRouter({
    routeTree: root.addChildren([people, detail, login]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the person detail with observations timeline and graph neighbors", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push([u, init]);
    if (u.includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (u.includes("/people") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "p1",
            slug: "jane-doe",
            name: "Jane Doe",
            role: "Engineer",
            company_id: "c1",
            email: "jane@example.com",
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
    if (u.includes("/companies") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "c1",
            slug: "acme",
            name: "Acme Corp",
            domain: null,
            notes: null,
            created_at: "",
            updated_at: "",
          },
        ]),
        { status: 200 },
      );
    }
    if (u.includes("/contexts") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (u.includes("/observations") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "o1",
            subject_type: "person",
            subject_id: "p1",
            date: "2026-02-01",
            kind: "fact",
            body: "Met Jane at a conference",
            source: null,
            created_at: "2026-02-01T00:00:00Z",
            updated_at: "2026-02-01T00:00:00Z",
          },
        ]),
        { status: 200 },
      );
    }
    if (u.includes("/graph/query") && init?.method === "POST") {
      return new Response(
        JSON.stringify([
          { id: "p2", label: "Person", rel: "KNOWS", label_text: "John Roe" },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderDetail(fetchMock);

  // Heading shows the person name.
  await screen.findByRole("heading", { name: "Jane Doe" });

  // Linked company resolves to its name.
  await screen.findByText("Acme Corp");

  // Observations timeline (filtered to this person) renders the body.
  await screen.findByText("Met Jane at a conference");

  // Mini relationship graph (neighbors) renders the connected node.
  await screen.findByText("John Roe");

  // Observations were requested filtered to subject_type=person + subject_id.
  await waitFor(() => {
    const obsCall = calls.find(([uu]) => uu.includes("/observations"));
    expect(obsCall).toBeDefined();
    expect(obsCall![0]).toContain("subject_type=person");
    expect(obsCall![0]).toContain("subject_id=p1");
  });

  // Graph neighbors were requested via POST /graph/query with the neighbors intent.
  const graphCall = calls.find(
    ([uu, init]) => uu.includes("/graph/query") && init?.method === "POST",
  );
  expect(graphCall).toBeDefined();
  const graphBody = JSON.parse(graphCall![1]!.body as string);
  expect(graphBody.intent).toBe("neighbors");
  expect(graphBody.params.person_id).toBe("p1");
});
