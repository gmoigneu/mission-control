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
import { TagsPage } from "./tags";

afterEach(() => vi.restoreAllMocks());

function renderTags(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const tags = createRoute({
    getParentRoute: () => root,
    path: "/tags",
    component: TagsPage,
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
  const history = createMemoryHistory({ initialEntries: ["/tags"] });
  const router = createRouter({
    routeTree: root.addChildren([tags, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the tags page and POSTs when Add is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/tags") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/tags") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "t1",
          name: "My Tag",
          kind: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderTags(fetchMock);

  await screen.findByRole("heading", { name: "Tags" });

  await userEvent.click(screen.getByRole("button", { name: /new/i }));

  await userEvent.type(screen.getByRole("textbox", { name: /name/i }), "My Tag");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/tags") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.name).toBe("My Tag");
  });
});
