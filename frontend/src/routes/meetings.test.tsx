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
import { MeetingsPage } from "./meetings.page";

afterEach(() => vi.restoreAllMocks());

function renderMeetings(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const meetings = createRoute({
    getParentRoute: () => root,
    path: "/meetings",
    component: MeetingsPage,
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
  const history = createMemoryHistory({ initialEntries: ["/meetings"] });
  const router = createRouter({
    routeTree: root.addChildren([meetings, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the meetings page and POSTs when Add is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/meetings") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          id: "m1",
          slug: "weekly-sync",
          title: "Weekly sync",
          at: "2026-01-01T10:00:00Z",
          context_id: null,
          project_id: null,
          location: null,
          body: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 201 },
      );
    }
    // All GET list endpoints (meetings, contexts, projects, people, entity-links).
    return new Response(JSON.stringify([]), { status: 200 });
  });

  renderMeetings(fetchMock);

  await screen.findByRole("heading", { name: "Meetings" });

  await userEvent.click(screen.getByRole("button", { name: /create/i }));

  await userEvent.type(screen.getByRole("textbox", { name: /title/i }), "Weekly sync");
  await userEvent.type(screen.getByRole("textbox", { name: /slug/i }), "weekly-sync");

  // datetime-local input is not a textbox role; query by aria-label.
  const whenInput = screen.getByLabelText("When");
  await userEvent.type(whenInput, "2026-01-01T10:00");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/meetings") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.title).toBe("Weekly sync");
    expect(body.slug).toBe("weekly-sync");
    expect(typeof body.at).toBe("string");
  });
});
