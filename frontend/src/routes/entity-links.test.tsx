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
import { EntityLinksPage } from "./entity-links";

afterEach(() => vi.restoreAllMocks());

function renderEntityLinks(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const entityLinks = createRoute({
    getParentRoute: () => root,
    path: "/entity-links",
    component: EntityLinksPage,
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
  const history = createMemoryHistory({ initialEntries: ["/entity-links"] });
  const router = createRouter({
    routeTree: root.addChildren([entityLinks, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the entity-links page and POSTs with from_type/from_id/to_type/to_id when Add is clicked", async () => {
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
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/contexts") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "c1",
            name: "X",
            slug: "x",
            description: null,
            archived: false,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/entity-links") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/entity-links") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "el1",
          from_type: "person",
          from_id: "p1",
          to_type: "context",
          to_id: "c1",
          kind: "related",
          created_at: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      );
    }
    // All other list endpoints return empty arrays
    return new Response(JSON.stringify([]), { status: 200 });
  });

  renderEntityLinks(fetchMock);

  await screen.findByRole("heading", { name: "Entity Links" });

  await userEvent.click(screen.getByRole("button", { name: /new/i }));

  // Wait for comboboxes to render
  await waitFor(() => {
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(4);
  });

  const comboboxes = screen.getAllByRole("combobox");
  // comboboxes[0] = from type (SubjectPicker 1 type)
  // comboboxes[1] = from id (SubjectPicker 1 id)
  // comboboxes[2] = to type (SubjectPicker 2 type)
  // comboboxes[3] = to id (SubjectPicker 2 id)

  // Select from type = "person"
  await userEvent.selectOptions(comboboxes[0], "person");

  // Wait for person options to appear in from id select
  await waitFor(() => {
    expect(screen.getAllByRole("option", { name: "A" }).length).toBeGreaterThan(0);
  });

  await userEvent.selectOptions(comboboxes[1], "p1");

  // Select to type = "context"
  await userEvent.selectOptions(comboboxes[2], "context");

  // Wait for context options to appear in to id select
  await waitFor(() => {
    expect(screen.getAllByRole("option", { name: "X" }).length).toBeGreaterThan(0);
  });

  await userEvent.selectOptions(comboboxes[3], "c1");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/entity-links") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.from_type).toBe("person");
    expect(body.from_id).toBe("p1");
    expect(body.to_type).toBe("context");
    expect(body.to_id).toBe("c1");
  });
});
