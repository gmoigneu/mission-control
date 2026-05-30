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
import { EntityTagsPage } from "./entity-tags";

afterEach(() => vi.restoreAllMocks());

function renderEntityTags(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const entityTags = createRoute({
    getParentRoute: () => root,
    path: "/entity-tags",
    component: EntityTagsPage,
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
  const history = createMemoryHistory({ initialEntries: ["/entity-tags"] });
  const router = createRouter({
    routeTree: root.addChildren([entityTags, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the entity-tags page and POSTs with tag_id/subject_type/subject_id when Add is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/tags") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "t1",
            name: "ai",
            kind: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ]),
        { status: 200 },
      );
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
    if (String(url).includes("/entity-tags") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/entity-tags") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "et1",
          tag_id: "t1",
          subject_type: "person",
          subject_id: "p1",
          created_at: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      );
    }
    // All other list endpoints return empty arrays
    return new Response(JSON.stringify([]), { status: 200 });
  });

  renderEntityTags(fetchMock);

  await screen.findByRole("heading", { name: "Entity Tags" });

  // Wait for tags to load, then select tag t1
  await waitFor(() => {
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  const comboboxes = screen.getAllByRole("combobox");
  // comboboxes[0] = tag select, comboboxes[1] = subject type select, comboboxes[2] = subject id select
  await userEvent.selectOptions(comboboxes[0], "t1");

  // Change subject type to "person" first (SubjectPicker: type select then id select)
  await userEvent.selectOptions(comboboxes[1], "person");

  // Wait for person options to appear in the id select
  await waitFor(() => {
    expect(screen.getByRole("option", { name: "A" })).toBeDefined();
  });

  await userEvent.selectOptions(comboboxes[2], "p1");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/entity-tags") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.tag_id).toBe("t1");
    expect(body.subject_type).toBe("person");
    expect(body.subject_id).toBe("p1");
  });
});
