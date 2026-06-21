import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { ProactiveFeedbackControls } from "./ProactiveFeedbackControls";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderControls(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProactiveFeedbackControls
        sourceProactiveRunId="11111111-1111-4111-8111-111111111111"
        routineType="daily_planning"
        entityType="project"
        entityRef="launch"
        triggerRef="morning-plan"
      />
    </QueryClientProvider>,
  );
}

function renderControlsWithoutContext(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProactiveFeedbackControls />
    </QueryClientProvider>,
  );
}

it("posts explicit useful feedback with run and scope context", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    return new Response(
      JSON.stringify({
        id: "pref-1",
        preference_type: "useful",
        scope: "trigger",
        routine_type: "daily_planning",
        entity_type: "project",
        entity_ref: "launch",
        trigger_ref: "morning-plan",
        value: {},
        source_proactive_run_id: "11111111-1111-4111-8111-111111111111",
        requires_confirmation: false,
        active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }),
      { status: 201 },
    );
  });

  renderControls(fetchMock);
  await userEvent.click(screen.getByRole("button", { name: /mark useful/i }));

  await waitFor(() => {
    const post = calls.find(([url]) => String(url).includes("/proactive-preferences/feedback"));
    expect(post).toBeDefined();
    const body = JSON.parse(post![1]!.body as string);
    expect(body.action).toBe("useful");
    expect(body.source_proactive_run_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.routine_type).toBe("daily_planning");
    expect(body.entity_ref).toBe("launch");
    expect(body.trigger_ref).toBe("morning-plan");
  });

  await screen.findByText(/preference saved: useful/i);
});

it("posts remind-later feedback from the datetime control", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    return new Response(
      JSON.stringify({
        id: "pref-2",
        preference_type: "remind_later",
        scope: "trigger",
        routine_type: "daily_planning",
        entity_type: "project",
        entity_ref: "launch",
        trigger_ref: "morning-plan",
        value: {},
        source_proactive_run_id: null,
        requires_confirmation: false,
        active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }),
      { status: 201 },
    );
  });

  renderControls(fetchMock);
  const input = screen.getByLabelText(/remind later time/i);
  await userEvent.clear(input);
  await userEvent.type(input, "2026-06-22T09:30");
  await userEvent.click(screen.getByRole("button", { name: /^remind later$/i }));

  await waitFor(() => {
    const post = calls.find(([url]) => String(url).includes("/proactive-preferences/feedback"));
    expect(post).toBeDefined();
    const body = JSON.parse(post![1]!.body as string);
    expect(body.action).toBe("remind_later");
    expect(body.remind_until).toContain("2026-06-22T");
  });
});

it("disables scoped actions when no real context is available", () => {
  renderControlsWithoutContext(vi.fn());

  expect(screen.getByRole("button", { name: /mute routine/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /mute entity or topic/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /do not show again/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /mark useful/i })).toBeEnabled();
});

it("posts local time and timezone offset for never-at-this-time feedback", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    return new Response(JSON.stringify({ id: "pref-3" }), { status: 201 });
  });

  renderControls(fetchMock);
  await userEvent.click(screen.getByRole("button", { name: /never at this time/i }));

  await waitFor(() => {
    const post = calls.find(([url]) => String(url).includes("/proactive-preferences/feedback"));
    expect(post).toBeDefined();
    const body = JSON.parse(post![1]!.body as string);
    expect(body.action).toBe("never_at_this_time");
    expect(body.never_at_time).toMatch(/^\d{2}:\d{2}$/);
    expect(typeof body.timezone_offset_minutes).toBe("number");
  });
});

it("does not post remind-later feedback with an empty datetime", async () => {
  const fetchMock = vi.fn();
  renderControls(fetchMock);

  const input = screen.getByLabelText(/remind later time/i);
  await userEvent.clear(input);
  await userEvent.click(screen.getByRole("button", { name: /^remind later$/i }));

  expect(fetchMock).not.toHaveBeenCalled();
});
