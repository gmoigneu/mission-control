import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useCapture, invalidateForWrites, type AgentWrite } from "./api";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const MOCK_CAPTURE_RESPONSE = {
  agent_run_id: "r1",
  reply: "Done",
  conversation_id: null,
  writes: [
    {
      id: "a1",
      action: "create",
      entity_type: "task",
      entity_id: "t1",
    },
  ],
  capture: {
    id: "c1",
    raw_text: "create a task to email Bob",
    transcript: null,
    source_surface: "cmd_k",
    source_metadata: {},
    status: "previewed",
    confidence_summary: { confidence: 0.92 },
    structured_result: {
      intent: "create_task",
      confidence: 0.92,
      ambiguity_notes: [],
      suggested_next_action: "Create a task",
      proposed_actions: [],
    },
    agent_run_id: "r1",
    created_entity_refs: [],
    inbox_item_id: null,
    created_at: "2026-06-22T00:00:00Z",
    updated_at: "2026-06-22T00:00:00Z",
  },
  result: {
    intent: "create_task",
    confidence: 0.92,
    ambiguity_notes: [],
    suggested_next_action: "Create a task",
    proposed_actions: [],
  },
};

it("useCapture POSTs to /api/agent/capture with the provided text", async () => {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(MOCK_CAPTURE_RESPONSE), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useCapture(), { wrapper });

  const res = await result.current.mutateAsync({ text: "create a task to email Bob" });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  // Verify the POST fired at the correct URL
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/agent/capture");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toEqual({ text: "create a task to email Bob" });

  // Verify the response shape
  expect(res.agent_run_id).toBe("r1");
  expect(res.reply).toBe("Done");
  expect(res.writes).toHaveLength(1);
  expect(res.writes[0].action).toBe("create");
  expect(res.writes[0].entity_type).toBe("task");
});

it("invalidateForWrites invalidates the matching list query + audit", async () => {
  const qc = new QueryClient();
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

  const writes: AgentWrite[] = [
    { id: "a1", action: "create", entity_type: "task", entity_id: "t1" },
    { id: "a2", action: "create", entity_type: "person", entity_id: "p1" },
    // duplicate entity_type — should only invalidate once per key
    { id: "a3", action: "create", entity_type: "task", entity_id: "t2" },
  ];

  invalidateForWrites(qc, writes);

  // tasks, people, audit — three distinct invalidations
  expect(invalidateSpy).toHaveBeenCalledTimes(3);
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tasks"] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["people"] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["audit"] });
});
