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
import { SearchPage } from "./search";

afterEach(() => vi.restoreAllMocks());

function renderSearch(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  // Create a local route with the same validateSearch so SearchPage's useSearch() works.
  const search = createRoute({
    getParentRoute: () => root,
    path: "/search",
    validateSearch: (s: Record<string, unknown>) => ({
      q: typeof s.q === "string" ? s.q : undefined,
    }),
    component: SearchPage,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  // Destinations search results link to — registered so <Link> resolves hrefs.
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => <div /> });
  const personDetail = stub("/people/$slug");
  const people = stub("/people");
  const companies = stub("/companies");
  const projects = stub("/projects");
  const contexts = stub("/contexts");
  const tasks = stub("/tasks");
  const history = createMemoryHistory({ initialEntries: ["/search"] });
  const router = createRouter({
    routeTree: root.addChildren([
      search,
      login,
      personDetail,
      people,
      companies,
      projects,
      contexts,
      tasks,
    ]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders search page, fires GET /search on Enter, shows result row", async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (u.includes("/search")) {
      return new Response(
        JSON.stringify([
          {
            subject_type: "person",
            subject_id: "p1",
            score: 0.91,
            snippet: "Python engineer",
            name: "Alice Engineer",
            slug: "alice-engineer",
          },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderSearch(fetchMock);

  // Wait for RequireAuth to resolve
  await screen.findByRole("heading", { name: "Search" });

  const input = screen.getByRole("textbox", { name: /search query/i });
  await userEvent.type(input, "python engineer");
  await userEvent.keyboard("{Enter}");

  // Result row should render: a type badge, the entity snippet, and a name that
  // deep-links to the person detail page.
  await screen.findByText("Person");
  await screen.findByText("Python engineer");
  const link = await screen.findByRole("link", { name: "Alice Engineer" });
  expect(link).toHaveAttribute("href", "/people/alice-engineer");

  // A GET to /search with the query should have been fired
  await waitFor(() => {
    const searchCall = calls.find((u) => u.includes("/search?q="));
    expect(searchCall).toBeDefined();
    expect(searchCall).toContain(encodeURIComponent("python engineer"));
  });
});
