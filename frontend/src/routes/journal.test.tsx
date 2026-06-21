import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { JournalPage } from "./journal.page";

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderJournal(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  window.scrollTo = vi.fn();

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

function journalEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "j1",
    date: today,
    title: "Today",
    body: "# Morning\n\nAlready started.",
    mood: 4,
    energy: 3,
    source: null,
    created_at: `${today}T00:00:00Z`,
    updated_at: `${today}T00:00:00Z`,
    ...overrides,
  };
}

function okJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

function findJournalEditor() {
  return screen.findByRole("textbox", { name: /journal entry/i }, { timeout: 5000 });
}

it("opens today as an editable markdown draft and creates it after debounce", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return okJson({ id: "u1", email: "g@x.com", name: "G" });
    }
    if (String(url).includes("/journal-entries") && (!init?.method || init.method === "GET")) {
      return okJson([]);
    }
    if (String(url).includes("/journal-entries") && init?.method === "POST") {
      return okJson(journalEntry({ body: "# Today\n\nAdded a note." }), 201);
    }
    return okJson({});
  });

  renderJournal(fetchMock);

  await screen.findByRole("heading", { name: "Journal" });
  const editor = await findJournalEditor();

  vi.useFakeTimers();
  fireEvent.change(editor, {
    target: { value: "# Today\n\nAdded a note." },
  });

  expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");

  await act(async () => {
    vi.advanceTimersByTime(2100);
  });
  vi.useRealTimers();

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/journal-entries") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.date).toBe(today);
    expect(body.body).toBe("# Today\n\nAdded a note.");
  });
});

it("autosaves edits to an existing entry with PATCH after debounce", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return okJson({ id: "u1", email: "g@x.com", name: "G" });
    }
    if (String(url).includes("/journal-entries") && (!init?.method || init.method === "GET")) {
      return okJson([journalEntry()]);
    }
    if (String(url).includes("/journal-entries/j1") && init?.method === "PATCH") {
      return okJson(journalEntry({ body: "# Morning\n\nAlready started.\n\nFollow-up." }));
    }
    return okJson({});
  });

  renderJournal(fetchMock);

  await screen.findByRole("heading", { name: "Journal" });
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /journal entry/i })).toHaveValue(
      "# Morning\n\nAlready started.",
    );
  }, { timeout: 5000 });
  const editor = screen.getByRole("textbox", { name: /journal entry/i });

  vi.useFakeTimers();
  fireEvent.change(editor, {
    target: { value: "# Morning\n\nAlready started.\n\nFollow-up." },
  });

  await act(async () => {
    vi.advanceTimersByTime(2100);
  });
  vi.useRealTimers();

  await waitFor(() => {
    const patchCall = calls.find(
      ([url, init]) => String(url).includes("/journal-entries/j1") && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]!.body as string);
    expect(body.body).toBe("# Morning\n\nAlready started.\n\nFollow-up.");
  });
});

it("saves dirty changes before navigating to the previous journal day", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return okJson({ id: "u1", email: "g@x.com", name: "G" });
    }
    if (String(url).includes("/journal-entries") && (!init?.method || init.method === "GET")) {
      return okJson([
        journalEntry(),
        journalEntry({
          id: "j0",
          date: yesterday,
          title: "Yesterday",
          body: "Older notes.",
          created_at: `${yesterday}T00:00:00Z`,
          updated_at: `${yesterday}T00:00:00Z`,
        }),
      ]);
    }
    if (String(url).includes("/journal-entries/j1") && init?.method === "PATCH") {
      return okJson(journalEntry({ body: "# Morning\n\nSaved before leaving." }));
    }
    return okJson({});
  });

  renderJournal(fetchMock);

  await screen.findByRole("heading", { name: "Journal" });

  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /journal entry/i })).toHaveValue(
      "# Morning\n\nAlready started.",
    );
  }, { timeout: 5000 });
  const editor = screen.getByRole("textbox", { name: /journal entry/i });

  fireEvent.change(editor, {
    target: { value: "# Morning\n\nSaved before leaving." },
  });

  fireEvent.click(screen.getByRole("button", { name: /previous journal day/i }));

  await waitFor(() => {
    const patchCall = calls.find(
      ([url, init]) => String(url).includes("/journal-entries/j1") && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall![1]!.body as string);
    expect(body.body).toBe("# Morning\n\nSaved before leaving.");
  });

  await screen.findByRole("heading", { name: yesterday });
  expect(screen.getByRole("textbox", { name: /journal entry/i })).toHaveValue("Older notes.");
});
