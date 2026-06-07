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
import { InboxPage } from "./inbox";

afterEach(() => vi.restoreAllMocks());

function renderInbox(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const inbox = createRoute({
    getParentRoute: () => root,
    path: "/inbox",
    component: InboxPage,
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
  const history = createMemoryHistory({ initialEntries: ["/inbox"] });
  const router = createRouter({
    routeTree: root.addChildren([inbox, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the inbox page and POSTs when Add is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/inbox") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/inbox") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "i1",
          body: "triage me later",
          status: "open",
          source: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderInbox(fetchMock);

  await screen.findByRole("heading", { name: "Inbox" });

  await userEvent.click(screen.getByRole("button", { name: /new/i }));

  await userEvent.type(screen.getByRole("textbox", { name: /body/i }), "triage me later");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/inbox") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.body).toBe("triage me later");
  });
});
