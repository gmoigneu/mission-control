import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { makeResourceHooks } from "./hooks";
import { resource } from "./resource";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

interface Item {
  id: string;
  name: string;
}

it("useList resolves data from fetch", async () => {
  const items: Item[] = [{ id: "1", name: "First" }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(items), { status: 200 })),
  );
  const res = resource<Item, { name: string }, { name?: string }>("/items");
  const { useList } = makeResourceHooks<Item, { name: string }, { name?: string }>("items", res);
  const { result } = renderHook(() => useList(), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual(items));
});

it("useCreate triggers a refetch after mutating", async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ id: "2", name: "New" }), { status: 200 });
    }
    return new Response(JSON.stringify([{ id: "1", name: "Old" }]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const res = resource<Item, { name: string }, { name?: string }>("/items");
  const { useList, useCreate } = makeResourceHooks<Item, { name: string }, { name?: string }>(
    "items",
    res,
  );

  const { result } = renderHook(() => ({ list: useList(), create: useCreate() }), { wrapper });

  // Wait for initial list fetch
  await waitFor(() => expect(result.current.list.data).toBeDefined());
  const callsBefore = fetchMock.mock.calls.length;

  // Trigger create
  await result.current.create.mutateAsync({ name: "New" });

  // Expect fetch was called again (refetch triggered by invalidation)
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore + 1));
});
