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
import { PeoplePage } from "./people";

afterEach(() => vi.restoreAllMocks());

function renderPeople(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const people = createRoute({
    getParentRoute: () => root,
    path: "/people",
    component: PeoplePage,
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
  const history = createMemoryHistory({ initialEntries: ["/people"] });
  const router = createRouter({
    routeTree: root.addChildren([people, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the people page and POSTs with name/slug; empty optional FK fields are omitted", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/companies") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/contexts") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/people") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/people") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "p1",
          slug: "jane-doe",
          name: "Jane Doe",
          role: null,
          company_id: null,
          email: null,
          linkedin: null,
          first_met: null,
          primary_context_id: null,
          summary: null,
          archived: false,
          created_at: "",
          updated_at: "",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderPeople(fetchMock);

  // Wait for the page to render (RequireAuth resolves)
  await screen.findByRole("heading", { name: "People" });

  // Type name and slug
  await userEvent.type(screen.getByRole("textbox", { name: /name/i }), "Jane Doe");
  await userEvent.type(screen.getByRole("textbox", { name: /slug/i }), "jane-doe");

  // Click Add — leave all optional fields empty
  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  // Assert a POST to /people was fired with the name/slug
  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/people") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.name).toBe("Jane Doe");
    expect(body.slug).toBe("jane-doe");
    // Empty optional FK selects must NOT send "" as a uuid value
    expect(body.company_id).not.toBe("");
    expect(body.primary_context_id).not.toBe("");
    // They should be absent from the payload (not sent at all)
    expect("company_id" in body).toBe(false);
    expect("primary_context_id" in body).toBe(false);
  });
});
