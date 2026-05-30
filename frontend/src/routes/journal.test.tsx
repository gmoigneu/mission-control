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

it("renders the journal page and POSTs a new entry with the date", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/journal") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/journal") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "j1",
          date: "2026-05-30",
          summary: null,
          mood: null,
          energy: null,
          telos_alignment: null,
          body: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 201 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderJournal(fetchMock);

  await screen.findByRole("heading", { name: "Journal" });

  // Set the date and submit
  const dateInput = screen.getByLabelText(/date/i);
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, "2026-05-30");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/journal") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.date).toBe("2026-05-30");
    // Empty optional ratings must be sent as null, not ""
    expect(body.mood).toBe(null);
    expect(body.energy).toBe(null);
  });
});
