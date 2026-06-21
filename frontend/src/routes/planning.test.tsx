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
import { PlanningPage } from "./planning.page";

afterEach(() => vi.restoreAllMocks());

const MESSAGE = {
  id: "m1",
  kind: "morning_triage",
  status: "sent",
  title: "Morning triage · 2026-06-23",
  summary: "Aya found 2 urgent items.",
  body: {
    recommendations: [
      {
        id: "task-t1",
        type: "task",
        task_id: "t1",
        title: "Pay overdue invoice",
        bucket: "overdue",
        rank: 1,
        suggested_action: "keep_today",
        reason: "Due before the plan date",
        proposed_changes: { scheduled: "2026-06-23" },
        status: "pending",
        due: "2026-06-22",
        scheduled: null,
      },
      {
        id: "inbox-i1",
        type: "inbox_item",
        inbox_item_id: "i1",
        title: "Turn note into task",
        bucket: "inbox",
        rank: 2,
        suggested_action: "convert_inbox_to_task",
        reason: "Inbox item needs explicit triage",
        proposed_changes: { title: "Turn note into task" },
        status: "pending",
      },
    ],
    sections: {
      committed_task_ids: ["t1"],
      overdue_task_ids: ["t1"],
      due_today_task_ids: [],
      due_soon_task_ids: [],
      stale_or_unclear_task_ids: [],
      inbox_item_ids: ["i1"],
    },
  },
  related_task_ids: ["t1"],
  related_inbox_item_ids: ["i1"],
  target_date: "2026-06-23",
  app_link: "/planning?message=m1",
  sent_channels: ["in_app"],
  agent_run_id: null,
  sent_at: "2026-06-23T08:00:00Z",
  reviewed_at: null,
  created_at: "2026-06-23T08:00:00Z",
  updated_at: "2026-06-23T08:00:00Z",
};

function renderPlanning(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const root = createRootRoute();
  const planning = createRoute({
    getParentRoute: () => root,
    path: "/planning",
    component: PlanningPage,
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
  const history = createMemoryHistory({ initialEntries: ["/planning"] });
  const router = createRouter({
    routeTree: root.addChildren([planning, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders planning recommendations and applies selected items", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/planning/messages/m1/apply")) {
      return new Response(JSON.stringify({ message: { ...MESSAGE, status: "applied" }, applied: ["task-t1"], audit_link: "/activity" }), {
        status: 200,
      });
    }
    if (String(url).includes("/planning/messages") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([MESSAGE]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderPlanning(fetchMock);

  expect(await screen.findByRole("heading", { name: "Morning triage · 2026-06-23" })).toBeDefined();
  expect(screen.getByText("Pay overdue invoice")).toBeInTheDocument();
  expect(screen.getByText("Turn note into task")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /apply selected in app/i }));

  await waitFor(() => {
    const applyCall = calls.find(
      ([url, init]) => String(url).includes("/planning/messages/m1/apply") && init?.method === "POST",
    );
    expect(applyCall).toBeDefined();
    const body = JSON.parse(applyCall![1]!.body as string);
    expect(body.items.map((item: { recommendation_id: string }) => item.recommendation_id)).toEqual([
      "task-t1",
      "inbox-i1",
    ]);
    expect(body.items[0].changes).toBeUndefined();
    expect(body.items[1].changes).toBeUndefined();
  });
});

it("only sends scheduled when the user explicitly customizes a date", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/planning/messages/m1/apply")) {
      return new Response(
        JSON.stringify({
          message: { ...MESSAGE, status: "applied" },
          applied: ["task-t1"],
          audit_link: "/activity",
        }),
        { status: 200 },
      );
    }
    if (String(url).includes("/planning/messages") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([MESSAGE]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderPlanning(fetchMock);

  const date = await screen.findByLabelText(/date for pay overdue invoice/i);
  await userEvent.clear(date);
  await userEvent.type(date, "2026-06-30");
  await userEvent.click(screen.getByRole("button", { name: /apply selected in app/i }));

  await waitFor(() => {
    const applyCall = calls.find(
      ([url, init]) =>
        String(url).includes("/planning/messages/m1/apply") && init?.method === "POST",
    );
    expect(applyCall).toBeDefined();
    const body = JSON.parse(applyCall![1]!.body as string);
    expect(body.items[0].changes).toEqual({ scheduled: "2026-06-30" });
    expect(body.items[1].changes).toBeUndefined();
  });
});

it("generates a morning triage message", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/planning/messages/generate")) {
      return new Response(JSON.stringify(MESSAGE), { status: 201 });
    }
    if (String(url).includes("/planning/messages") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderPlanning(fetchMock);

  await screen.findByRole("heading", { name: "No plan selected" });
  await userEvent.click(screen.getByRole("button", { name: /morning/i }));

  await waitFor(() => {
    const generateCall = calls.find(
      ([url, init]) => String(url).includes("/planning/messages/generate") && init?.method === "POST",
    );
    expect(generateCall).toBeDefined();
    expect(JSON.parse(generateCall![1]!.body as string).kind).toBe("morning_triage");
  });
});
