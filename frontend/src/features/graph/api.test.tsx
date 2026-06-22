import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useGraphNeighborhood, useGraphSnapshot, useNodeDetail } from "./api";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockFetch(calls: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ nodes: [], edges: [], truncated: false, label: "Person", props: {}, rels: [] }),
        { status: 200 },
      );
    }),
  );
}

it("useGraphSnapshot GETs /graph/full with the context query param", async () => {
  const calls: string[] = [];
  mockFetch(calls);
  const { result } = renderHook(() => useGraphSnapshot("work"), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(calls.some((u) => u.includes("/api/graph/full?context=work"))).toBe(true);
});

it("useNodeDetail GETs /graph/node/{id} and is disabled without an id", async () => {
  const calls: string[] = [];
  mockFetch(calls);
  const { result } = renderHook(() => useNodeDetail("a"), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(calls.some((u) => u.includes("/api/graph/node/a"))).toBe(true);
});

it("useGraphNeighborhood GETs a bounded neighborhood", async () => {
  const calls: string[] = [];
  mockFetch(calls);
  const { result } = renderHook(() => useGraphNeighborhood("a", 2, 60), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(calls.some((u) => u.includes("/api/graph/neighborhood/a?depth=2&limit=60"))).toBe(
    true,
  );
});
