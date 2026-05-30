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

it("renders the inbox page and POSTs with title; empty optional fields are omitted", async () => {
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
          title: "My Item",
          source_type: "other",
          url: null,
          status: "queued",
          priority: "normal",
          note: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderInbox(fetchMock);

  // Wait for the page to render (RequireAuth resolves)
  await screen.findByRole("heading", { name: "Inbox" });

  // Type the title — leave all optional fields empty
  await userEvent.type(screen.getByRole("textbox", { name: /title/i }), "My Item");

  // Click Add
  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  // Assert a POST to /inbox was fired with the title
  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/inbox") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.title).toBe("My Item");
    // Empty optional fields must NOT be sent as ""
    expect(body.url).not.toBe("");
    expect(body.note).not.toBe("");
    // They should be absent from the payload (not sent at all)
    expect("url" in body).toBe(false);
    expect("note" in body).toBe(false);
  });
});

it("transitions an item from queued to reviewed via the Review action", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/inbox") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "i1",
            title: "Captured thing",
            source_type: "article",
            url: null,
            status: "queued",
            priority: "normal",
            note: null,
            created_at: "",
            updated_at: "",
          },
        ]),
        { status: 200 },
      );
    }
    if (String(url).includes("/inbox/i1") && init?.method === "PATCH") {
      return new Response(
        JSON.stringify({
          id: "i1",
          title: "Captured thing",
          source_type: "article",
          url: null,
          status: "reviewed",
          priority: "normal",
          note: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderInbox(fetchMock);

  await screen.findByRole("heading", { name: "Inbox" });
  const reviewBtn = await screen.findByRole("button", { name: /^review$/i });
  await userEvent.click(reviewBtn);

  await waitFor(() => {
    const patchCall = calls.find(
      ([url, init]) => String(url).includes("/inbox/i1") && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]!.body as string);
    expect(body.status).toBe("reviewed");
  });
});
