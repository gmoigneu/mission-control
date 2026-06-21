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
import { HabitsPage } from "./habits";

afterEach(() => vi.restoreAllMocks());

function renderHabits(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const habits = createRoute({
    getParentRoute: () => root,
    path: "/habits",
    component: HabitsPage,
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
  const history = createMemoryHistory({ initialEntries: ["/habits"] });
  const router = createRouter({
    routeTree: root.addChildren([habits, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const HABIT = {
  id: "h1",
  slug: "workout",
  name: "Workout",
  cadence: "daily",
  tracking_type: "boolean",
  active: true,
  streak: 3,
  logged_today: false,
  today_score: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const SCORE_HABIT = {
  ...HABIT,
  id: "h2",
  slug: "sleep-quality",
  name: "Sleep quality",
  tracking_type: "score",
};

const CHECKINS = [
  {
    id: null,
    date: "2026-06-19",
    mood: null,
    energy: null,
    productivity: null,
    updated_at: null,
  },
  {
    id: "j1",
    date: "2026-06-20",
    mood: 4,
    energy: 3,
    productivity: 5,
    updated_at: "2026-06-20T08:00:00Z",
  },
];

const HABIT_LOGS = [
  {
    id: "l1",
    habit_id: "h1",
    date: "2026-06-20",
    done: true,
    score: null,
    created_at: "2026-06-20T08:00:00Z",
    updated_at: "2026-06-20T08:00:00Z",
  },
  {
    id: "l2",
    habit_id: "h2",
    date: "2026-06-20",
    done: true,
    score: 4,
    created_at: "2026-06-20T08:00:00Z",
    updated_at: "2026-06-20T08:00:00Z",
  },
];

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

it("renders the habits page and POSTs when Add is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/daily-checkins")) {
      return new Response(JSON.stringify(CHECKINS), { status: 200 });
    }
    if (String(url).includes("/habits/logs")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/habits") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/habits") && init?.method === "POST") {
      return new Response(JSON.stringify(HABIT), { status: 201 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderHabits(fetchMock);

  await screen.findByRole("heading", { name: "Habits" });

  await userEvent.click(screen.getByRole("button", { name: /create/i }));

  await userEvent.type(screen.getByRole("textbox", { name: /name/i }), "Workout");
  await userEvent.type(screen.getByRole("textbox", { name: /slug/i }), "workout");

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await waitFor(() => {
    const postCall = calls.find(
      ([url, init]) => String(url).includes("/habits") && init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall![1]!.body as string);
    expect(body.name).toBe("Workout");
    expect(body.slug).toBe("workout");
    expect(body.cadence).toBe("daily");
    expect(body.tracking_type).toBe("boolean");
  });
}, 20_000);

it("renders the combined six-month review grid", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/daily-checkins")) {
      return new Response(JSON.stringify(CHECKINS), { status: 200 });
    }
    if (String(url).includes("/habits/logs")) {
      return new Response(JSON.stringify(HABIT_LOGS), { status: 200 });
    }
    if (String(url).includes("/habits")) {
      return new Response(JSON.stringify([HABIT, SCORE_HABIT]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderHabits(fetchMock);

  expect(await screen.findByText(/6-month review/)).toBeInTheDocument();
  expect(
    screen.getByLabelText("Mood on 2026-06-20: 4 of 5"),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText("Productivity on 2026-06-20: 5 of 5"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Workout on 2026-06-20: done")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Sleep quality on 2026-06-20: 4 of 5"),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/habits/logs?days=183"),
    expect.anything(),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/daily-checkins?days=183"),
    expect.anything(),
  );
});

it("logs a boolean habit when a grid cell is clicked", async () => {
  const today = todayISO();
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/daily-checkins")) {
      return new Response(JSON.stringify(CHECKINS), { status: 200 });
    }
    if (String(url).includes("/habits/logs")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/habits/h1/logs") && init?.method === "POST") {
      return new Response(
        JSON.stringify({ id: "l1", habit_id: "h1", done: true, score: null }),
        { status: 201 },
      );
    }
    if (String(url).includes("/habits") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([HABIT]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderHabits(fetchMock);

  await screen.findByText("Workout");

  await userEvent.click(
    screen.getByRole("button", { name: `Workout on ${today}: not done` }),
  );

  await waitFor(() => {
    const logCall = calls.find(
      ([url, init]) => String(url).includes("/habits/h1/logs") && init?.method === "POST",
    );
    expect(logCall).toBeDefined();
    const body = JSON.parse(logCall![1]!.body as string);
    expect(body.done).toBe(true);
    expect(body.date).toBe(today);
  });
});

it("logs a score habit when a grid cell is clicked", async () => {
  const today = todayISO();
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/daily-checkins")) {
      return new Response(JSON.stringify(CHECKINS), { status: 200 });
    }
    if (String(url).includes("/habits/logs")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (String(url).includes("/habits/h2/logs") && init?.method === "POST") {
      return new Response(
        JSON.stringify({ id: "l2", habit_id: "h2", done: false, score: 0 }),
        { status: 201 },
      );
    }
    if (String(url).includes("/habits") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([SCORE_HABIT]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderHabits(fetchMock);

  await screen.findByText("Sleep quality");

  await userEvent.click(
    screen.getByRole("button", { name: `Sleep quality on ${today}: no entry` }),
  );

  await waitFor(() => {
    const logCall = calls.find(
      ([url, init]) => String(url).includes("/habits/h2/logs") && init?.method === "POST",
    );
    expect(logCall).toBeDefined();
    const body = JSON.parse(logCall![1]!.body as string);
    expect(body.score).toBe(0);
    expect(body.date).toBe(today);
  });
});
