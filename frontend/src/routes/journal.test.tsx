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
import { JournalPage } from "./journal";

afterEach(() => vi.restoreAllMocks());

function renderJournal(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const journal = createRoute({
    getParentRoute: () => root,
    path: "/journal",
    component: JournalPage,
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
  const history = createMemoryHistory({ initialEntries: ["/journal"] });
  const router = createRouter({
    routeTree: root.addChildren([journal, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the journal page and POSTs when Add is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/journal-entries") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/journal-entries") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "j1",
          date: "2026-05-29",
          title: "Friday",
          body: "Shipped the journal feature.",
          mood: 4,
          energy: 3,
          source: null,
          created_at: "2026-05-29T00:00:00Z",
          updated_at: "2026-05-29T00:00:00Z",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderJournal(fetchMock);

  await screen.findByRole("heading", { name: "Journal" });

  await userEvent.click(screen.getByRole("button", { name: /create/i }));

  await userEvent.type(screen.getByRole("textbox", { name: /entry/i }), "Shipped the journal feature.");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/journal-entries") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.body).toBe("Shipped the journal feature.");
    expect(body.date).toBeTruthy();
  });
  await screen.findByRole("heading", { name: "Friday" });
});

it("does not show raw markdown syntax in the entry rail preview", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/journal-entries")) {
      return new Response(
        JSON.stringify([
          {
            id: "j1",
            date: "2026-05-29",
            title: "Friday",
            body: "# Big day\n\n**Bold idea** and _notes_",
            mood: 4,
            energy: 3,
            source: null,
            created_at: "2026-05-29T00:00:00Z",
            updated_at: "2026-05-29T00:00:00Z",
          },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderJournal(fetchMock);

  await screen.findByRole("heading", { name: "Journal" });
  expect(await screen.findByText("Big day Bold idea and notes")).toBeInTheDocument();
  expect(screen.queryByText(/# Big day/)).not.toBeInTheDocument();
});

it("hides a deleted selected entry while the refetch catches up", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const entries = [
    {
      id: "j1",
      date: "2026-05-30",
      title: "Newest",
      body: "Delete me.",
      mood: 4,
      energy: 3,
      source: null,
      created_at: "2026-05-30T00:00:00Z",
      updated_at: "2026-05-30T00:00:00Z",
    },
    {
      id: "j2",
      date: "2026-05-29",
      title: "Previous",
      body: "Keep me.",
      mood: 3,
      energy: 3,
      source: null,
      created_at: "2026-05-29T00:00:00Z",
      updated_at: "2026-05-29T00:00:00Z",
    },
  ];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/journal-entries") && init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (String(url).includes("/journal-entries")) {
      return new Response(JSON.stringify(entries), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderJournal(fetchMock);

  await screen.findByRole("heading", { name: "Newest" });
  await userEvent.click(screen.getByRole("button", { name: /edit/i }));
  await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
  await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

  await screen.findByRole("heading", { name: "Previous" });
  expect(screen.queryByRole("heading", { name: "Newest" })).not.toBeInTheDocument();
  expect(
    calls.some(([url, init]) => String(url).includes("/journal-entries/j1") && init?.method === "DELETE"),
  ).toBe(true);
});
